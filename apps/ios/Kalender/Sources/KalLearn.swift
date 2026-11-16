import SwiftUI

/* ---------------- Q26: «Lær Glimt hva dette er…» – fra Homelabs gamle kalender til den delte Kalenderen ---------------- */
// Det brukeren lærer Glimt: avsender/bedrift → type/tittel («Påhåret» → Frisør · Påhåret). Per bruker på serveren:
//   POST /api/glimt/memory {match, type, title?} → {item, matches} · POST /api/glimt/memory/:id/apply → {count}
//   GET /api/kalender/events/:id gir Glimt konteksten («det var frisør»). PATCH /api/kalender/events/:id kan svare
//   suggestMemory {match, name, type, title, text} – forslaget vises og lagres bare med «Husk».
// Listen over det Glimt husker ligger i Homelab: Innstillinger → Glimt og AI → Glimt → Glimt husker.

struct KalLearnForm: Equatable {
    var name: String
    var type: String = ""
    var title: String = ""
    var text: String = ""
    var suggest: Bool = false
    var asked: Bool = false
    var count: Int = 0
    var memId: Int? = nil
    var error: String = ""
    var busy: Bool = false
}

@MainActor
@Observable
final class KalLearnModel {
    static let shared: KalLearnModel = KalLearnModel()

    static let types: [(String, String)] = [("frisør", "Frisør"), ("lege", "Lege"), ("tannlege", "Tannlege"), ("fysio", "Fysio"),
                                            ("optiker", "Optiker"), ("psykolog", "Psykolog"), ("annet", "Annet")]

    var form: KalLearnForm? = nil

    static func typeName(_ t: String) -> String {
        for x in types where x.0 == t { return x.1 }
        return "Annet"
    }

    /// «frisøren din» (Ok, Glimt husker at X er frisøren din).
    static func din(_ t: String) -> String {
        let m: [String: String] = ["frisør": "frisøren din", "lege": "legen din", "tannlege": "tannlegen din", "fysio": "fysioterapeuten din",
                                   "optiker": "optikeren din", "psykolog": "psykologen din"]
        return m[t] ?? "lagret"
    }

    /// Hendelsen som vises blir konteksten for «det var frisør» i Glimt. Svaret trengs ikke.
    func shown(_ e: KalEvent) {
        guard e.editable, !e.pending else { return }
        let id: String = e.id
        Task { _ = try? await KalNet.send("GET", "/api/kalender/events/" + KalNet.enc(id), json: nil, timeout: 8) }
    }

    /// Detaljarket lukkes først, så åpnes arket (to ark oppå hverandre blir uryddig).
    func open(_ e: KalEvent) {
        let n: String = KalLearnModel.nameOf(title: e.title, note: e.note)
        withAnimation(.easeOut(duration: 0.22)) { KalStore.shared.detId = nil }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            withAnimation(.easeOut(duration: 0.22)) { self.form = KalLearnForm(name: n) }
        }
    }

    /// Forslaget fra PATCH (brukeren ga en rask time ny tittel).
    func suggest(_ o: [String: Any]?) {
        guard let o else { return }
        let name: String = KalParse.str(o, "name")
        if name.isEmpty { return }
        let t: String = KalParse.str(o, "type")
        var f: KalLearnForm = KalLearnForm(name: name)
        f.type = t == "annet" ? "" : t
        f.title = KalParse.str(o, "title")
        f.text = KalParse.str(o, "text")
        f.suggest = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            withAnimation(.easeOut(duration: 0.22)) { self.form = f }
        }
    }

    func close() {
        withAnimation(.easeOut(duration: 0.22)) { form = nil }
    }

    func save() {
        guard var l = form else { return }
        let name: String = l.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if l.type.isEmpty { l.error = "Velg hva det er."; form = l; return }
        if name.count < 2 { l.error = "Skriv navnet på avsenderen."; form = l; return }
        let custom: String = l.title.trimmingCharacters(in: .whitespaces)
        var title: String = KalLearnModel.typeName(l.type) + " · " + name
        if l.type == "annet" { title = custom.isEmpty ? name : custom } else if l.suggest && !custom.isEmpty { title = custom }
        l.busy = true
        l.error = ""
        form = l
        let body: [String: Any] = ["match": name, "type": l.type, "title": title]
        Task {
            do {
                let d: Data = try await KalNet.send("POST", "/api/glimt/memory", json: body, timeout: 15)
                let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
                let item: [String: Any] = (o["item"] as? [String: Any]) ?? [:]
                guard var c = self.form else { return }
                c.busy = false
                c.asked = true
                c.memId = KalParse.int(item, "id")
                c.count = KalParse.int(o, "matches") ?? 0
                let saved: String = KalParse.str(item, "title")
                c.title = saved.isEmpty ? title : saved
                c.name = name
                self.form = c
                KalHaptic.done()
            } catch let e as KalNetError {
                if var c = self.form {
                    c.busy = false
                    c.error = e.status == 404 ? "Krever nyere server." : e.message
                    self.form = c
                }
            } catch {
                if var c = self.form {
                    c.busy = false
                    c.error = error.localizedDescription
                    self.form = c
                }
            }
        }
    }

    /// «Endre»: gir egne avtaler aliasets tittel.
    func apply() {
        guard var l = form, let id = l.memId else { return }
        l.busy = true
        form = l
        Task {
            do {
                let d: Data = try await KalNet.send("POST", "/api/glimt/memory/" + String(id) + "/apply", json: [:], timeout: 30)
                let o: [String: Any] = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any]) ?? [:]
                let n: Int = KalParse.int(o, "count") ?? 0
                self.close()
                let word: String = n == 1 ? "avtale" : "avtaler"
                KalStore.shared.showToast(n == 0 ? "Ingen avtaler å endre" : String(n) + " " + word + " fikk nytt navn", undo: "")
                await KalStore.shared.load(force: true)
            } catch {
                if var c = self.form {
                    c.busy = false
                    c.error = "Kunne ikke endre avtalene."
                    self.form = c
                }
            }
        }
    }

    /// Avsenderen i notatet («Mvh PÅHÅRET Studio Hoff» → «Påhåret Studio Hoff»), ellers tittelen uten «Frisør · ».
    static func nameOf(title: String, note: String) -> String {
        let keys: [String] = ["med vennlig hilsen", "vennlig hilsen", "hilsen", "mvh"]
        let low: String = note.lowercased()
        for k in keys {
            guard let r = low.range(of: k, options: .backwards) else { continue }
            let off: Int = low.distance(from: low.startIndex, to: r.upperBound)
            var rest: String = String(note.dropFirst(off)).trimmingCharacters(in: CharacterSet(charactersIn: " ,.:\n"))
            if let cut = rest.firstIndex(where: { (c: Character) -> Bool in c == "\n" || c == "." || c == "!" || c == "," }) {
                rest = String(rest[..<cut])
            }
            rest = rest.trimmingCharacters(in: .whitespaces)
            let first: Character? = rest.first
            let okStart: Bool = (first?.isUppercase ?? false) || (first?.isNumber ?? false)
            if rest.count >= 2 && rest.count <= 50 && okStart { return nice(rest) }
        }
        var t: String = title
        if let dot = t.range(of: " · ") { t = String(t[dot.upperBound...]) }
        return nice(t.trimmingCharacters(in: .whitespaces))
    }

    /// «PÅHÅRET Studio Hoff» → «Påhåret Studio Hoff».
    static func nice(_ s: String) -> String {
        let keep: Set<String> = ["AS", "ASA", "DA", "ANS"]
        let words: [String] = s.split(separator: " ").map { (w: Substring) -> String in
            let x: String = String(w)
            let letters: String = x.filter { (c: Character) -> Bool in c.isLetter }
            if letters.count < 2 || letters != letters.uppercased() || keep.contains(x) { return x }
            return String(x.prefix(1)) + x.dropFirst().lowercased()
        }
        return words.joined(separator: " ")
    }
}

/* ---------- Arket ---------- */

struct KalLearnSheet: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLearnModel { KalLearnModel.shared }

    var body: some View {
        KalSheetFrame {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            KalLabel(text: "✦ GLIMT HUSKER", color: t.acc)
                            Text("Lær Glimt hva dette er").font(KalFont.serif(24)).foregroundStyle(t.ink)
                        }
                        Spacer(minLength: 4)
                        KalPill(title: "Lukk", filled: false) { m.close() }
                    }
                    if let l = m.form {
                        if l.asked { KalLearnAsk(l: l) } else { KalLearnPick(l: l) }
                    }
                }
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
        }
    }
}

private struct KalLearnPick: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLearnModel { KalLearnModel.shared }
    let l: KalLearnForm

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !l.text.isEmpty {
                Text(l.text).font(KalFont.ui(15)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
            }
            KalLabel(text: "HVA ER DETTE?")
            KalFlow(spacing: 6) {
                ForEach(KalLearnModel.types, id: \.0) { (x: (String, String)) in
                    KalChip(title: x.1, on: l.type == x.0) {
                        m.form?.type = x.0
                        m.form?.error = ""
                    }
                }
            }
            field("Navn på avsender, f.eks. Påhåret", Binding<String>(get: { m.form?.name ?? "" }, set: { (v: String) in m.form?.name = v }))
            if l.type == "annet" {
                field("Tittel, f.eks. Massasje · Spa Nova", Binding<String>(get: { m.form?.title ?? "" }, set: { (v: String) in m.form?.title = v }))
            }
            if !l.error.isEmpty {
                Text(l.error).font(KalFont.ui(13, .semibold)).foregroundStyle(t.acc)
            }
            KalPill(title: l.busy ? "Lagrer …" : (l.suggest ? "Husk" : "Lagre"), enabled: !l.type.isEmpty && !l.busy, height: 46) { m.save() }
            Text("Glimt bruker dette neste gang en melding fra samme avsender legges inn. Listen ligger i Homelab: Innstillinger → Glimt og AI → Glimt → Glimt husker.")
                .font(KalFont.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func field(_ ph: String, _ b: Binding<String>) -> some View {
        TextField(ph, text: b)
            .font(KalFont.ui(15)).foregroundStyle(t.ink)
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
            .padding(.horizontal, 14)
            .frame(height: 48)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(t.chip))
    }
}

private struct KalLearnAsk: View {
    @Environment(\.kal) private var t
    @MainActor private var m: KalLearnModel { KalLearnModel.shared }
    let l: KalLearnForm

    private var doneText: String { "Ok, Glimt husker at " + l.name + " er " + KalLearnModel.din(l.type) + "." }

    private var askText: String {
        let word: String = l.count == 1 ? "avtale" : "avtaler"
        return "Endre tittel på " + String(l.count) + " " + word + " til «" + l.title + "»?"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(doneText).font(KalFont.ui(15)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
            if l.count > 0 {
                Text(askText).font(KalFont.ui(15)).foregroundStyle(t.ink).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    KalPill(title: l.busy ? "Endrer …" : "Endre", enabled: !l.busy, height: 46) { m.apply() }
                    KalPill(title: "Nei takk", filled: false, height: 46) { m.close() }
                }
            } else {
                KalPill(title: "Ferdig", height: 46) { m.close() }
            }
            if !l.error.isEmpty {
                Text(l.error).font(KalFont.ui(13, .semibold)).foregroundStyle(t.acc)
            }
        }
    }
}
