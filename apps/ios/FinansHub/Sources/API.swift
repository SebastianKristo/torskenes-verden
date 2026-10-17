import Foundation
import Security

/// Klient for FinansHub-API-et (/finans/api). Appen snakker aldri med resten av homelab.
struct APIError: LocalizedError {
    let message: String
    let status: Int
    var errorDescription: String? { message }
}

struct API {
    let base: String
    let token: String?

    private func url(_ path: String) -> URL { URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/finans/api" + path)! }

    private func send(_ req: URLRequest) async throws -> Data {
        var r = req
        r.timeoutInterval = 30
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, res) = try await URLSession.shared.data(for: r)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        if code >= 400 {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(message: msg ?? "Feil \(code)", status: code)
        }
        return data
    }

    func get<T: Decodable>(_ path: String, as: T.Type = T.self) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await send(URLRequest(url: url(path))))
    }

    @discardableResult
    func call(_ method: String, _ path: String, json: [String: Any]? = nil) async throws -> Data {
        var r = URLRequest(url: url(path))
        r.httpMethod = method
        if let json {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        return try await send(r)
    }

    func bytes(_ path: String) async throws -> Data {
        let full = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path)!
        return try await send(URLRequest(url: full))
    }

    struct Part { let name: String; let filename: String; let mime: String; let data: Data }

    /// Multipart: original + nedskalert JPEG til AI + miniatyrbilde.
    func upload(_ path: String, parts: [Part]) async throws -> Data {
        let boundary = "FinansHub-\(UUID().uuidString)"
        var body = Data()
        for p in parts {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(p.name)\"; filename=\"\(p.filename)\"\r\nContent-Type: \(p.mime)\r\n\r\n".data(using: .utf8)!)
            body.append(p.data)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        var r = URLRequest(url: url(path))
        r.httpMethod = "POST"
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        r.httpBody = body
        return try await send(r)
    }

    /// Bytter passord mot et token som bare gir tilgang til FinansHub.
    static func login(base: String, password: String, device: String) async throws -> String {
        let data = try await API(base: base, token: nil).call("POST", "/auth/token", json: ["password": password, "deviceName": device])
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any], let t = obj["token"] as? String else {
            throw APIError(message: "Uventet svar fra serveren", status: 0)
        }
        return t
    }
}

/// Token og serveradresse lagres i nøkkelringen.
enum Keychain {
    static func set(_ key: String, _ value: String?) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "finanshub", kSecAttrAccount as String: key]
        SecItemDelete(q as CFDictionary)
        guard let value else { return }
        var add = q
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
    static func get(_ key: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "finanshub", kSecAttrAccount as String: key,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
}
