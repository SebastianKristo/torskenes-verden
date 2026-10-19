import SwiftUI
import PhotosUI
import UIKit

/* ---------------- Prompt 27: nytt abonnement fra skjermbilde ---------------- */
// Fasit: «+ Legg til abonnement» → «Fra skjermbilde» i design/Subscription OS.dc.html og
// prompts/prompt-27-pakke/claude-code-abo-skjermbilde.md.
// POST /finans/api/subscriptions/from-screenshot (multipart «image») → {tjeneste, plan, pris (øre NOK), valuta, prisOriginal?,
// syklus:'mnd'|'år', neste_trekk, kategori, logoUrl?, domain?, sikkerhet:{felt:0–1}, check:[felt…], existingId?}.
// Leses lokalt av Ollama (bildemodell) på hjemmeserveren; bildet slettes etter lesing.
// Visning: miniatyr, rader med ✓ eller «Sjekk» (sikkerhet < 0,8 eller i check), «+ Legg til …», «Rediger først»,
// og «Oppdater …» når tjenesten allerede finnes.

struct SubShotResult27 {
    var name: String
    var plan: String
    /// Kroner (NOK).
    var price: Double
    var currency: String
    var priceOriginal: String
    /// monthly | yearly
    var cycle: String
    /// YYYY-MM-DD
    var next: String
    var category: String
    var logoUrl: String?
    var domain: String?
    var existingId: Int?
    var unsure: Set<String>

    init(_ o: [String: Any]) {
        name = JS.str(o, "tjeneste") ?? JS.str(o, "name") ?? ""
        plan = JS.str(o, "plan") ?? ""
        price = (JS.num(o, "pris") ?? 0) / 100
        currency = (JS.str(o, "valuta") ?? "NOK").uppercased()
        if let po = o["prisOriginal"] as? String { priceOriginal = po } else if let n = JS.num(o, "prisOriginal") { priceOriginal = String(format: "%.2f", n) } else { priceOriginal = "" }
        let syk: String = (JS.str(o, "syklus") ?? "mnd").lowercased()
        cycle = (syk == "år" || syk == "ar" || syk == "yearly" || syk == "year") ? "yearly" : "monthly"
        next = JS.str(o, "neste_trekk") ?? JS.str(o, "nextDate") ?? ""
        category = JS.str(o, "kategori") ?? JS.str(o, "category") ?? "Annet"
        logoUrl = JS.str(o, "logoUrl")
        domain = JS.str(o, "domain")
        existingId = JS.int(o, "existingId")
        var u: Set<String> = Set(JS.strings(o, "check").map { $0.lowercased() })
        if let s = JS.dict(o, "sikkerhet") {
            for (k, v) in s {
                let n: Double? = (v as? Double) ?? (v as? Int).map { Double($0) }
                if let n, n < 0.8 { u.insert(k.lowercased()) }
            }
        }
        unsure = u
    }

    func check(_ keys: [String]) -> Bool { keys.contains { unsure.contains($0) } }

    var day: Int { next.count >= 10 ? (Int(next.dropFirst(8).prefix(2)) ?? 1) : Calendar.current.component(.day, from: Date()) }
    var month: Int { next.count >= 7 ? (Int(next.dropFirst(5).prefix(2)) ?? 1) : Calendar.current.component(.month, from: Date()) }

    /// «12. nov»
    var nextText: String {
        let m: Int = Swift.max(1, Swift.min(12, month))
        return "\(day). \(SubCalc23.monthShort[m - 1].lowercased())"
    }

    var priceText: String {
        let kr: String = SubCalc23.kr(price)
        if currency == "NOK" || currency.isEmpty { return kr }
        return priceOriginal.isEmpty ? "≈ \(kr)" : "≈ \(kr) (\(priceOriginal) \(currency))"
    }

    /// Body for POST /subscriptions og PATCH /subscriptions/:id.
    var body: [String: Any] {
        var b: [String: Any] = ["name": name, "plan": plan, "price": price, "cycle": cycle, "category": category,
                                "billDay": day, "chargeDay": day, "status": "active", "active": true, "lowUse": false]
        if cycle == "monthly" { b["billMonth"] = NSNull() } else { b["billMonth"] = month }
        if let d = domain, !d.isEmpty { b["domain"] = d }
        if let l = logoUrl, !l.isEmpty { b["logoUrl"] = l }
        return b
    }

    /// Ferdig utfylt skjema («Rediger først»).
    var draft: SubItem {
        var o: [String: Any] = body
        o["id"] = 0
        o["nextDate"] = next
        if cycle == "monthly" { o.removeValue(forKey: "billMonth") }
        return SubItem(o)
    }
}

/// Panelet under flisene i «Legg til abonnement».
struct SubShot27Panel: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let t: SubTok23
    let done: () -> Void
    @State private var photo: PhotosPickerItem? = nil
    @State private var thumb: UIImage? = nil
    @State private var busy: Bool = false
    @State private var pct: Double = 0
    @State private var result: SubShotResult27? = nil
    @State private var error: String = ""
    @State private var editing: SubItem? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("✦ Ollama leser skjermbildet").font(PF.ui(16, .semibold)).foregroundStyle(t.fg)
                Spacer()
            }
            HStack(alignment: .top, spacing: 14) {
                thumbView
                VStack(alignment: .leading, spacing: 2) { status }
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let r = result, !busy { buttons(r) }
            PhotosPicker(selection: $photo, matching: .images) {
                Text(result == nil && !busy ? "Velg skjermbilde" : "Velg et annet bilde").font(PF.ui(14, .semibold))
                    .foregroundStyle(result == nil && !busy ? t.onFg : t.fg)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(result == nil && !busy ? t.on : Color.clear, in: Capsule())
                    .overlay(Capsule().stroke(result == nil && !busy ? Color.clear : t.bd, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(busy)
            Text("Leses lokalt av bildemodellen på hjemmeserveren. Bildet slettes etter lesing. Felt merket «Sjekk» var utydelige.")
                .font(PF.ui(12)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .background(t.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color(hex: "#3A2A20"), lineWidth: 1))
        .onChange(of: photo) { _, it in
            guard let it else { return }
            Task {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) {
                    await read(img)
                }
                photo = nil
            }
        }
        .sheet(item: Binding<SubShotEdit27?>(get: { editing.map { SubShotEdit27(item: $0) } }, set: { if $0 == nil { editing = nil } }), onDismiss: { done() }) { e in
            SubEdit23Sheet(item: nil, prefill27: e.item).environment(\.paper, p)
                .presentationDetents([.large])
                .presentationDragIndicator(.hidden)
                .presentationBackground(t.bg)
        }
    }

    private var thumbView: some View {
        ZStack(alignment: .top) {
            Color(hex: "#24242A")
            if let thumb { Image(uiImage: thumb).resizable().scaledToFill() }
        }
        .frame(width: 76, height: 130)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color(hex: "#2A2A31"), lineWidth: 1))
    }

    @ViewBuilder private var status: some View {
        if busy {
            Text("Finner tjeneste, plan, pris og trekkdato …").font(PF.ui(14)).foregroundStyle(t.fg).fixedSize(horizontal: false, vertical: true)
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(hex: "#2A2A31"))
                    Capsule().fill(SubTok23.orange).frame(width: g.size.width * pct)
                }
            }
            .frame(height: 4)
            .padding(.top, 8)
        } else if let r = result {
            row("Tjeneste", r.name.isEmpty ? "–" : r.name, r.check(["tjeneste", "name", "n"]))
            row("Plan", r.plan.isEmpty ? "–" : r.plan, r.check(["plan"]))
            row("Pris", r.priceText, r.check(["pris", "price", "v"]))
            row("Syklus", r.cycle == "yearly" ? "Årlig" : "Månedlig", r.check(["syklus", "cycle", "cyc"]))
            row("Neste trekk", r.nextText, r.check(["neste_trekk", "next", "day"]))
            row("Kategori", r.category, r.check(["kategori", "category", "cat"]))
        } else if !error.isEmpty {
            Text(error).font(PF.ui(13.5)).foregroundStyle(t.neg).fixedSize(horizontal: false, vertical: true)
        } else {
            Text("Velg et skjermbilde av kvitteringen, App Store-abonnementet, e-posten eller kontosiden.").font(PF.ui(13.5)).foregroundStyle(t.mut)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func row(_ k: String, _ v: String, _ unsure: Bool) -> some View {
        HStack(spacing: 10) {
            Text(k).font(PF.ui(12.5)).foregroundStyle(t.mut).frame(width: 84, alignment: .leading)
            Text(v).font(PF.ui(14.5, .semibold)).foregroundStyle(t.fg).lineLimit(1)
            Spacer(minLength: 4)
            Text(unsure ? "Sjekk" : "✓").font(PF.ui(11.5, .bold)).foregroundStyle(unsure ? SubTok23.peach : SubTok23.okFg)
        }
        .frame(minHeight: 32)
        .overlay(alignment: .bottom) { Rectangle().fill(t.bd).frame(height: 1) }
    }

    @ViewBuilder private func buttons(_ r: SubShotResult27) -> some View {
        let n: String = r.name.isEmpty ? "abonnementet" : r.name
        HStack(spacing: 8) {
            Button {
                Haptics.shared.success()
                if let id = r.existingId {
                    store.saveSub(id, ["plan": r.plan, "price": r.price, "cycle": r.cycle])
                } else {
                    store.saveSub(nil, r.body)
                }
                done()
            } label: {
                Text(r.existingId != nil ? "Oppdater \(n)" : "+ Legg til \(n)").font(PF.ui(14.5, .semibold)).foregroundStyle(SubTok23.ink0)
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(SubTok23.orange, in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(r.name.isEmpty)
            Button { Haptics.shared.tap(); editing = r.draft } label: {
                Text("Rediger først").font(PF.ui(14.5, .semibold)).foregroundStyle(t.fg)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .overlay(Capsule().stroke(t.bd, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        if r.existingId != nil {
            Text("\(n) finnes allerede. «Oppdater» endrer plan og pris.").font(PF.ui(12.5)).foregroundStyle(t.mut)
        }
    }

    private func read(_ img: UIImage) async {
        thumb = img
        result = nil
        error = ""
        busy = true
        pct = 0.08
        let ticker: Task<Void, Never> = Task { @MainActor in
            while !Task.isCancelled && pct < 0.9 {
                try? await Task.sleep(for: .milliseconds(300))
                withAnimation(.easeOut(duration: 0.3)) { pct = Swift.min(0.9, pct + 0.06) }
            }
        }
        defer { ticker.cancel(); busy = false }
        guard let jpg = img.scaled(max: 1600).jpegData(compressionQuality: 0.85) else { error = "Fikk ikke lest bildet."; return }
        do {
            let d: Data = try await store.api.upload("/subscriptions/from-screenshot", parts: [API.Part(name: "image", filename: "skjermbilde.jpg", mime: "image/jpeg", data: jpg)])
            let r: SubShotResult27 = SubShotResult27(JS.obj(d))
            pct = 1
            if r.name.isEmpty && r.price == 0 { error = "Fant ikke noe abonnement i bildet. Prøv et annet skjermbilde." } else { result = r }
        } catch let e as APIError {
            error = e.status == 404 ? "Skjermbilde-lesing finnes ikke på serveren ennå. Oppdater homelab." : e.message
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Innpakning for .sheet(item:).
struct SubShotEdit27: Identifiable {
    let item: SubItem
    var id: String { "shot27-\(item.name)" }
}
