import Foundation

/* ---------------- Prompt 41: Glimt nyhetsoppsummering – ren tekst uten rå kildehenvisninger ---------------- */
// Spesifikasjon: prompts/prompt-41-pakke/claude-code-nyhet-oppsummering-bredde.md (punkt 3 og 4).
// – «[9]», «[3, 4]» og løse «] · VG» fjernes fra brødteksten; kildene vises som små piller under avsnittet.
// – Temaord: egennavn får stor forbokstav og lista blir naturlig: «Mest om norge og oslo og økonomi.» → «Mest om Norge, Oslo og økonomi.»

enum News41Clean {
    static let proper: [String: String] = [
        "norge": "Norge", "oslo": "Oslo", "bergen": "Bergen", "trondheim": "Trondheim", "stavanger": "Stavanger", "sverige": "Sverige",
        "danmark": "Danmark", "europa": "Europa", "usa": "USA", "kina": "Kina", "russland": "Russland", "ukraina": "Ukraina",
        "israel": "Israel", "gaza": "Gaza", "nato": "NATO", "eu": "EU", "fn": "FN", "trump": "Trump", "støre": "Støre",
        "stortinget": "Stortinget", "nrk": "NRK", "vg": "VG", "e24": "E24", "tromsø": "Tromsø", "nord-norge": "Nord-Norge",
    ]

    /// Fjerner [n]-henvisninger og halve hakeparenteser, og rydder mellomrom.
    static func text(_ s: String) -> String {
        var out: String = s
        if let rx = try? NSRegularExpression(pattern: "\\s*\\[\\s*\\d+(\\s*[,–-]\\s*\\d+)*\\s*\\]", options: []) {
            out = rx.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out), withTemplate: "")
        }
        // Rester som «] · VG» eller «[» alene.
        if let rx = try? NSRegularExpression(pattern: "\\s*\\]\\s*(·\\s*[A-ZÆØÅ0-9][\\wÆØÅæøå]*)?|\\[\\s*$", options: []) {
            out = rx.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out), withTemplate: "")
        }
        out = out.replacingOccurrences(of: "  ", with: " ").replacingOccurrences(of: " .", with: ".").replacingOccurrences(of: " ,", with: ",")
        return topics(out.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// «Mest om norge og oslo og økonomi.» → «Mest om Norge, Oslo og økonomi.»
    static func topics(_ s: String) -> String {
        guard let r = s.range(of: "Mest om ", options: [.caseInsensitive]) else { return s }
        let head: String = String(s[..<r.upperBound])
        var rest: String = String(s[r.upperBound...])
        var tail: String = ""
        if let dot = rest.firstIndex(where: { $0 == "." || $0 == "!" || $0 == "\n" }) {
            tail = String(rest[dot...])
            rest = String(rest[..<dot])
        }
        var words: [String] = []
        for part in rest.components(separatedBy: " og ") {
            for p in part.components(separatedBy: ",") {
                let w: String = p.trimmingCharacters(in: .whitespaces)
                if !w.isEmpty { words.append(cap(w)) }
            }
        }
        if words.count < 2 { return head + words.joined() + tail }
        let list: String = words.dropLast().joined(separator: ", ") + " og " + (words.last ?? "")
        return head + list + tail
    }

    static func cap(_ w: String) -> String {
        if let p = proper[w.lowercased()] { return p }
        return w
    }
}
