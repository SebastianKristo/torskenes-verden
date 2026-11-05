import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Prompt 73 (LOGO73): «Endre logo» for en butikk i Finans ----------------
 Fasit: «Lagre og logo.dc.html» 1a (mobil-ark fra transaksjon). Papir-design: bakgrunn #f3efe6, kort #fff, kant #d8d1c2,
 tekst #1b1a17, dempet #8f897c, aksent #b23a2a. Newsreader, Manrope og IBM Plex Mono. Ikke mørkt glass.
 Søk:   GET /finans/api/logos?q= (debounce 250 ms) → [{id, name, domain, logoUrl}], hele logobiblioteket på serveren.
 Lagre: PUT /finans/api/merchants/:navn/logo {logoId | uploadId | initials:true | null(tilbakestill)}.
 Bilde: beskjæres til kvadrat på maks 512 px på telefonen, så POST /finans/api/merchants/logo/upload (serveren beskjærer også).
 Overstyringene (GET /finans/api/merchants/logo-overrides → names) brukes av PaperLogo overalt i Finans. */

/// Brukerens egne logovalg: navn (små bokstaver) → url, "" = initialer. Hentes høyst hvert minutt.
@MainActor
@Observable
final class LogoOv73 {
    static let shared = LogoOv73()
    private(set) var names: [String: String] = [:]
    /// Øker når kartet endres, så logoene tegnes på nytt.
    private(set) var version: Int = 0
    private var loadedAt: Date = .distantPast
    private var loading: Bool = false

    nonisolated static func key(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }

    /// nil = ingen overstyring, "" = initialer, ellers serverstien til logoen.
    func value(for name: String) -> String? {
        let k: String = LogoOv73.key(name)
        if k.isEmpty { return nil }
        return names[k]
    }

    func ensure(_ store: Store, force: Bool = false) async {
        if loading { return }
        if !force && Date().timeIntervalSince(loadedAt) < 60 { return }
        loading = true
        defer { loading = false }
        loadedAt = Date()
        guard let d = try? await store.api.call("GET", "/merchants/logo-overrides") else { return }
        let o: [String: Any] = JS.obj(d)
        guard let raw = o["names"] as? [String: Any] else { return }
        var next: [String: String] = [:]
        for (k, v) in raw {
            if let s = v as? String { next[LogoOv73.key(k)] = s }
        }
        if next != names {
            names = next
            version += 1
        }
    }

    /// Lokalt med en gang etter et valg (før kartet er hentet på nytt). url nil = fjern.
    func set(_ list: [String], _ url: String?) {
        for n in list {
            let k: String = LogoOv73.key(n)
            if k.isEmpty { continue }
            if let url { names[k] = url } else { names.removeValue(forKey: k) }
        }
        version += 1
    }
}

/// Ett treff i logobiblioteket (eller et opplastet bilde).
struct LogoHit73: Identifiable, Equatable {
    let id: String
    let name: String
    let domain: String
    let logoUrl: String
    var uploadId: String = ""
}

/// Liten logo fra serveren (med innlogging) i en hvit rute; forbokstaven når den mangler.
struct LogoThumb73: View {
    @Environment(Store.self) private var store
    let url: String
    let name: String
    var size: CGFloat = 40
    var radius: CGFloat = 11
    @State private var img: UIImage? = nil

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Color.white)
            if let img {
                Image(uiImage: img).resizable().scaledToFit().padding(size * 0.16)
            } else {
                Text(String(name.prefix(1)).uppercased()).font(PF.serif(size * 0.45, medium: true)).foregroundStyle(Color(hex: "#1b1a17"))
            }
        }
        .frame(width: size, height: size)
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Color(hex: "#e6e0d3"), lineWidth: 1))
        .task(id: url) { await load() }
    }

    private func load() async {
        if url.isEmpty { img = nil; return }
        img = await store.image(url)
    }
}

/// Arket «Endre logo». name = butikknavnet slik det vises; names = alle navn butikken vises med.
struct LogoSheet73: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    let name: String
    var names: [String] = []
    var currentUrl: String? = nil

    @State private var q: String = ""
    @State private var hits: [LogoHit73] = []
    @State private var total: Int = 0
    @State private var sel: LogoHit73? = nil
    @State private var manual: Bool = false
    @State private var initials: Bool = false
    @State private var curUrl: String = ""
    @State private var count: Int = 0
    @State private var busy: Bool = false
    @State private var searching: Bool = true
    @State private var pick: PhotosPickerItem? = nil
    @State private var errorText: String = ""
    @State private var searchTask: Task<Void, Never>? = nil

    private let bg = Color(hex: "#f3efe6")
    private let ink = Color(hex: "#1b1a17")
    private let line = Color(hex: "#d8d1c2")
    private let soft = Color(hex: "#e6e0d3")
    private let mut = Color(hex: "#8f897c")
    private let acc = Color(hex: "#b23a2a")

    var body: some View {
        VStack(spacing: 0) {
            header
            searchField
            Text("LOGODATABASEN · \(total) TREFF")
                .font(PF.mono(10.5)).tracking(1.2).foregroundStyle(mut)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 16).padding(.bottom, 8).padding(.leading, 2)
            list
            actions
        }
        .padding(.horizontal, 22)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(bg.ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(bg)
        .environment(\.colorScheme, .light)
        .task { await start() }
        .onChange(of: q) { _, v in schedule(v) }
        .onChange(of: pick) { _, v in
            guard let v else { return }
            Task { await upload(v) }
        }
    }

    /* ---------- Deler ---------- */

    private var preview: String {
        if let sel { return sel.logoUrl }
        if manual { return initials ? "" : curUrl }
        return currentUrl ?? curUrl
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("FINANS · BUTIKKLOGO").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(acc)
                Text("Endre logo").font(PF.serif(28, medium: true)).foregroundStyle(ink)
            }
            Spacer(minLength: 8)
            LogoThumb73(url: preview, name: name, size: 44, radius: 12)
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(ink)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.white))
                    .overlay(Circle().stroke(line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Lukk")
        }
        .padding(.top, 14).padding(.bottom, 16)
    }

    private var searchField: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass").font(.system(size: 16, weight: .semibold)).foregroundStyle(mut)
            TextField("Søk etter butikk", text: $q)
                .font(PF.ui(16)).foregroundStyle(ink)
                .textInputAutocapitalization(.never).autocorrectionDisabled(true)
                .submitLabel(.search)
            if !q.isEmpty {
                Button { q = "" } label: {
                    Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(ink)
                        .frame(width: 28, height: 28).background(Circle().fill(Color(hex: "#ebe5d8")))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Tøm")
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
        .background(Capsule().fill(Color.white))
        .overlay(Capsule().stroke(line, lineWidth: 1))
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if hits.isEmpty {
                    Text(searching ? "Søker …" : "Ingen butikker funnet").font(PF.ui(15)).foregroundStyle(mut)
                        .frame(maxWidth: .infinity).padding(.vertical, 28)
                }
                ForEach(hits) { h in
                    row(h)
                }
            }
        }
        .frame(maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.white))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(soft, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func row(_ h: LogoHit73) -> some View {
        let on: Bool = sel?.id == h.id
        return Button { sel = h } label: {
            HStack(spacing: 12) {
                LogoThumb73(url: h.logoUrl, name: h.name, size: 40, radius: 11)
                VStack(alignment: .leading, spacing: 1) {
                    Text(h.name).font(PF.ui(15, .semibold)).foregroundStyle(ink).lineLimit(1)
                    if !h.domain.isEmpty { Text(h.domain).font(PF.ui(13)).foregroundStyle(mut).lineLimit(1) }
                }
                Spacer(minLength: 4)
                if on {
                    Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(bg)
                        .frame(width: 24, height: 24).background(Circle().fill(ink))
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(minHeight: 60)
            .background(on ? Color(hex: "#f6f1e6") : Color.white)
            .overlay(alignment: .bottom) { Rectangle().fill(Color(hex: "#eee8dc")).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var actions: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                PhotosPicker(selection: $pick, matching: .images) { secondary("Last opp bilde") }
                    .buttonStyle(.plain)
                Button { Task { await save(["initials": true], "Viser initialer") } } label: { secondary("Bruk initialer") }
                    .buttonStyle(.plain)
            }
            Button { Task { await apply() } } label: {
                Text("Bruk denne logoen").font(PF.ui(16, .bold)).foregroundStyle(bg)
                    .frame(maxWidth: .infinity).frame(height: 54)
                    .background(Capsule().fill(ink))
                    .opacity(sel == nil || busy ? 0.4 : 1)
            }
            .buttonStyle(.plain)
            .disabled(sel == nil || busy)
            Text(countLine).font(PF.ui(13)).foregroundStyle(mut).multilineTextAlignment(.center)
            if !errorText.isEmpty { Text(errorText).font(PF.ui(13, .semibold)).foregroundStyle(acc).multilineTextAlignment(.center) }
            if manual {
                Button { Task { await save(nil, "Tilbake til automatisk logo") } } label: {
                    Text("Tilbakestill til automatisk").font(PF.ui(14, .semibold)).foregroundStyle(Color(hex: "#4a463e")).frame(minHeight: 44)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 14)
    }

    private func secondary(_ t: String) -> some View {
        Text(t).font(PF.ui(14, .semibold)).foregroundStyle(ink)
            .frame(maxWidth: .infinity).frame(height: 48)
            .background(Capsule().fill(Color.white))
            .overlay(Capsule().stroke(line, lineWidth: 1))
    }

    private var countLine: String {
        count > 0 ? "Gjelder alle \(count) kjøp fra \(name)" : "Gjelder alle kjøp fra \(name)"
    }

    /* ---------- Data ---------- */

    private var path: String {
        let enc: String = name.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? name
        return "/merchants/\(enc)/logo"
    }

    private func start() async {
        if q.isEmpty { q = name }
        if let d = try? await store.api.call("GET", path) {
            let o: [String: Any] = JS.obj(d)
            manual = JS.bool(o, "manual") ?? false
            initials = JS.bool(o, "initials") ?? false
            curUrl = JS.str(o, "logoUrl") ?? ""
            count = JS.int(o, "count") ?? 0
        }
        await search(q)
    }

    private func schedule(_ v: String) {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            await search(v)
        }
    }

    private func search(_ text: String) async {
        searching = true
        let enc: String = text.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        do {
            let d: Data = try await store.api.call("GET", "/logos?q=\(enc)&limit=60")
            if Task.isCancelled { return }
            let arr: [Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [Any]) ?? []
            var out: [LogoHit73] = []
            for v in arr {
                guard let o = v as? [String: Any], let id = JS.str(o, "id") else { continue }
                out.append(LogoHit73(id: id, name: JS.str(o, "name") ?? id, domain: JS.str(o, "domain") ?? "", logoUrl: JS.str(o, "logoUrl") ?? ""))
            }
            hits = out
            total = out.count
        } catch {
            if !Task.isCancelled { hits = []; total = 0 }
        }
        searching = false
    }

    /// Kvadrat i midten, maks 512 px (skala 1), som PNG.
    private func square512(_ img: UIImage) -> Data? {
        let side: CGFloat = min(img.size.width, img.size.height)
        if side <= 0 { return nil }
        let t: CGFloat = min(side, 512).rounded()
        let s: CGFloat = t / side
        let w: CGFloat = img.size.width * s
        let h: CGFloat = img.size.height * s
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let r = UIGraphicsImageRenderer(size: CGSize(width: t, height: t), format: format)
        let out: UIImage = r.image { _ in img.draw(in: CGRect(x: (t - w) / 2, y: (t - h) / 2, width: w, height: h)) }
        return out.pngData()
    }

    private func upload(_ item: PhotosPickerItem) async {
        defer { pick = nil }
        guard let d = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: d), let png = square512(img) else {
            errorText = "Kunne ikke lese bildet"
            return
        }
        busy = true
        defer { busy = false }
        do {
            let part = API.Part(name: "file", filename: "logo.png", mime: "image/png", data: png)
            let res: Data = try await store.api.upload("/merchants/logo/upload", parts: [part])
            let o: [String: Any] = JS.obj(res)
            guard let uid = JS.str(o, "uploadId"), let url = JS.str(o, "url") else { return }
            sel = LogoHit73(id: "upload:" + uid, name: "Eget bilde", domain: "", logoUrl: url, uploadId: uid)
            errorText = ""
        } catch {
            errorText = "Kunne ikke laste opp bildet"
        }
    }

    private func apply() async {
        guard let sel else { return }
        if sel.uploadId.isEmpty {
            await save(["logoId": sel.id], "Logo oppdatert")
        } else {
            await save(["uploadId": sel.uploadId], "Logo oppdatert")
        }
    }

    private func save(_ body: [String: Any]?, _ msg: String) async {
        if busy { return }
        busy = true
        defer { busy = false }
        do {
            let d: Data = try await store.api.call("PUT", path, json: body)
            let o: [String: Any] = JS.obj(d)
            let isManual: Bool = JS.bool(o, "manual") ?? false
            let all: [String] = [name] + names
            LogoOv73.shared.set(all, isManual ? (JS.str(o, "logoUrl") ?? "") : nil)
            await LogoOv73.shared.ensure(store, force: true)
            store.flash(msg)
            dismiss()
        } catch {
            errorText = "Kunne ikke lagre logoen"
        }
    }
}
