import SwiftUI
import UIKit

/* ---------------- Prompt 37: Subscription OS – gratis prøveperioder, skjul kort i wiggle og delte abonnementer ---------------- */
// prompts/prompt-37-pakke/claude-code-abo-provetid.md. Fasit: design/Subscription OS.dc.html (trVals/trList, soVals, esh, mv).
// Prøver: eksisterende /finans/api/subscriptions/trials (Trial31Model). «Avslutt nå ↗» åpner oppsigelsessiden og setter status
// cancelled; «Behold · legg til» setter kept og lager et vanlig abonnement (pris etterpå, trekkdato = sluttdato).
// Delte abonnementer (SERVER37): abo får members:[{userId,name,color}], split:'equal'|'payer', payerId, myShare;
// PUT /finans/api/subscriptions/:id/members {members:[userId], split, payerId} og POST …/:id/leave. Totaler bruker din del.

struct SubMember37: Hashable {
    var id: String
    var name: String
    var color: String = ""
}

enum Subs37 {
    /// Leser deling fra serveren. Delt: månedsbeløpet blir din del (lik deling = pris / antall, betaler = hele hos betaleren).
    static func fill(_ s: inout SubItem, _ o: [String: Any]) {
        var ms: [SubMember37] = []
        for m in JS.list(o, "members") {
            let id: String = JS.str(m, "userId") ?? JS.str(m, "id") ?? ""
            if id.isEmpty { continue }
            ms.append(SubMember37(id: id, name: JS.str(m, "name") ?? id, color: JS.str(m, "color") ?? ""))
        }
        s.members = ms
        s.split = JS.str(o, "split") ?? "equal"
        s.payerId = JS.str(o, "payerId") ?? ""
        s.myShare = JS.num(o, "myShare")
        if let share = s.myShare, s.price > 0, ms.count > 1 {
            s.monthly = s.monthly * Swift.max(0, share) / s.price
        }
    }

    /// «Delt · din del 400 kr/mnd».
    static func shareLine(_ s: SubItem) -> String {
        let share: Double = s.myShare ?? s.monthly
        return "Delt · din del " + SubCalc23.kr(share) + "/mnd"
    }

    static let orange: Color = Color(hex: "#C85A26")
    static let yellow: Color = Color(hex: "#a8661a")
    static let green: Color = Color(hex: "#2f7a4f")
}

/* ---------- Gratis prøveperioder (kort øverst på Oversikt) ---------- */

struct Sub37TrialsCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Trial31Model { Trial31Model.shared }
    let editing: Bool
    @State private var adding: Bool = false

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let list: [Trial31] = m.active.sorted { $0.daysLeft < $1.daysLeft }
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("GRATIS PRØVEPERIODER" + (list.isEmpty ? "" : " · \(list.count)")).font(PF.mono(10.5)).tracking(1.3).foregroundStyle(Subs37.orange)
                Spacer(minLength: 6)
                Button {
                    if editing { return }
                    Haptics.shared.tap()
                    adding = true
                } label: {
                    Text("+ Legg til").font(PF.ui(12.5, .bold)).foregroundStyle(t.fg)
                        .padding(.horizontal, 12).frame(height: 30)
                        .background(t.chip, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            if list.isEmpty {
                Text("Ingen aktive prøveperioder. Legg til en, så minner Glimt deg på å avslutte i tide.")
                    .font(PF.ui(13.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array(list.enumerated()), id: \.element.id) { i, tr in
                if i > 0 { Rectangle().fill(t.bd).frame(height: 1) }
                Sub37TrialRow(tr: tr, editing: editing)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .task(id: store.account?.id ?? "") { await m.load(store.api) }
        .sheet(isPresented: $adding) {
            Sub37TrialAddSheet(close: { adding = false })
                .environment(\.paper, p)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
                .presentationBackground(t.bg)
        }
    }
}

struct Sub37TrialRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    let tr: Trial31
    let editing: Bool

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        let d: Int = tr.daysLeft
        let col: Color = d <= 2 ? t.neg : (d <= 7 ? Subs37.yellow : t.fg)
        let w: TrialW32b = tr.widget32b
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                SubLogo23(name: tr.service, domain: Trials32b.domain(tr.service), logoUrl: nil, category: "Strømming", size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(tr.service).font(PF.ui(15, .bold)).foregroundStyle(t.fg).lineLimit(1)
                    Text("Slutter " + w.endShort + (tr.priceAfter.isEmpty ? "" : " · deretter " + tr.priceAfter))
                        .font(PF.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 0) {
                    Text("\(d)").font(PF.serif(30, medium: true)).foregroundStyle(col)
                    Text(d == 1 ? "dag igjen" : "dager igjen").font(PF.ui(11)).foregroundStyle(t.mut)
                }
            }
            GeometryReader { (g: GeometryProxy) in
                ZStack(alignment: .leading) {
                    Capsule().fill(t.chip)
                    Capsule().fill(col).frame(width: Swift.max(4, g.size.width * CGFloat(w.progress())))
                }
            }
            .frame(height: 5)
            HStack(spacing: 8) {
                Button { cancel() } label: {
                    Text("Avslutt nå ↗").font(PF.ui(12.5, .bold)).foregroundStyle(t.onFg)
                        .padding(.horizontal, 12).frame(height: 32)
                        .background(t.on, in: Capsule())
                }
                .buttonStyle(.plain)
                Button { keep() } label: {
                    Text("Behold · legg til").font(PF.ui(12.5, .bold)).foregroundStyle(t.fg)
                        .padding(.horizontal, 12).frame(height: 32)
                        .background(t.chip, in: Capsule())
                }
                .buttonStyle(.plain)
                Spacer(minLength: 4)
                Text("Varsel " + reminderText).font(PF.ui(11.5)).foregroundStyle(t.mut).lineLimit(1)
            }
            .disabled(editing)
        }
        .padding(.vertical, 4)
    }

    /// Dagen før slutt («tor 23. okt»).
    private var reminderText: String {
        guard let e = Trials32b.date(tr.endsAt), let r = Trials32b.cal.date(byAdding: .day, value: -1, to: e) else { return "dagen før" }
        let wd: Int = (Trials32b.cal.component(.weekday, from: r) + 6) % 7
        let mo: Int = Trials32b.cal.component(.month, from: r)
        return Trials32b.wd[wd] + " \(Trials32b.cal.component(.day, from: r)). " + Trials32b.ms[mo - 1]
    }

    private func cancel() {
        Haptics.shared.tap()
        let u: String = tr.cancelUrl.isEmpty ? Trial31Parse.cancelURL(tr.service) : tr.cancelUrl
        if let url = URL(string: u) { openURL(url) }
        patch(["status": "cancelled", "res": "avsluttet"])
    }

    private func keep() {
        Haptics.shared.success()
        patch(["status": "kept", "res": "beholdt"])
        let price: String = tr.priceAfter.filter { $0.isNumber || $0 == "," || $0 == "." }.replacingOccurrences(of: ",", with: ".")
        let day: Int = Int(tr.endsAt.dropFirst(8).prefix(2)) ?? 1
        let body: [String: Any] = ["name": tr.service, "price": price.isEmpty ? "0" : price, "cycle": "monthly", "chargeDay": day, "nextDate": tr.endsAt]
        Task {
            _ = try? await store.api.call("POST", "/subscriptions", json: body)
            try? await store.loadSubs()
            store.flash(tr.service + " er lagt til som abonnement")
        }
    }

    private func patch(_ body: [String: Any]) {
        let id: String = Cal27Model.enc(tr.id)
        let api: API = store.api
        Task {
            _ = try? await api.callAt("/finans/api", "PATCH", "/subscriptions/trials/" + id, json: body, timeout: 15)
            await Trial31Model.shared.load(api)
        }
    }
}

/// «+ Legg til»: tjeneste, sluttdato, pris etterpå → «Legg til · påminn dagen før».
struct Sub37TrialAddSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let close: () -> Void
    @State private var service: String = ""
    @State private var end: Date = Calendar.current.date(byAdding: .day, value: 14, to: Date()) ?? Date()
    @State private var price: String = ""
    @State private var saving: Bool = false

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Ny prøveperiode").font(PF.ui(20, .semibold)).foregroundStyle(t.fg)
                Spacer(minLength: 6)
                SheetButton30(kind: .secondary, title: "Lukk", ink: t.fg, paper: t.bg, dark: t.dark) { close() }
            }
            SubField23(label: "Tjeneste", placeholder: "F.eks. Viaplay", text: $service)
            DatePicker("Slutter", selection: $end, in: Date()..., displayedComponents: .date)
                .font(PF.ui(15, .semibold)).foregroundStyle(t.fg)
            SubField23(label: "Pris etterpå (kr/mnd)", placeholder: "149", text: $price, keyboard: .decimalPad, mono: true)
            Button { save() } label: {
                Text(saving ? "Lagrer …" : "Legg til · påminn dagen før").font(PF.ui(15, .bold)).foregroundStyle(t.onFg)
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background(t.on, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(saving || service.trimmingCharacters(in: .whitespaces).isEmpty)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20).padding(.top, 22).padding(.bottom, 16)
        .background(t.bg.ignoresSafeArea())
        .environment(\.colorScheme, t.dark ? .dark : .light)
    }

    private func save() {
        saving = true
        Task { @MainActor in
            // Varsel dagen før (kl. 09) og morgenen samme dag.
            let ok: Bool = await Trial31Model.shared.save(service: service, end: end, price: price, offsets: [1, 0], store)
            saving = false
            if ok {
                Haptics.shared.success()
                close()
            }
        }
    }
}

/* ---------- Delte abonnementer: seksjonen i redigeringsarket ---------- */

struct Sub37ShareSection: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let item: SubItem
    @State private var picked: Set<String> = []
    @State private var split: String = "equal"
    @State private var payer: String = ""
    @State private var ready: Bool = false
    @MainActor private var tm: TasksModel { TasksModel.shared }

    private var meId: String {
        let me: String = (store.account?.username ?? "").lowercased()
        return tm.members.first { $0.username.lowercased() == me }?.id ?? ""
    }

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        VStack(alignment: .leading, spacing: 10) {
            Text("Del med husstanden").font(PF.ui(13)).foregroundStyle(t.mut)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(tm.members) { (mem: TaskMember17) in
                        chip(mem, t)
                    }
                }
            }
            if shared {
                HStack(spacing: 6) {
                    pill("Del likt", split == "equal", t) { split = "equal"; push() }
                    pill("Jeg betaler", split == "payer", t) { split = "payer"; payer = meId; push() }
                }
                Text(hint).font(PF.ui(12.5)).foregroundStyle(t.mut).fixedSize(horizontal: false, vertical: true)
                if !isOwnerOrPayer {
                    Button { leave() } label: {
                        Text("Forlat abonnementet").font(PF.ui(13.5, .bold)).foregroundStyle(t.neg)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(14)
        .background(t.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .task {
            if tm.members.isEmpty { await tm.load(store) }
            if !ready {
                picked = Set(item.members.map(\.id))
                split = item.split
                payer = item.payerId
                ready = true
            }
        }
    }

    private var shared: Bool { picked.filter { $0 != meId }.count > 0 }

    private var isOwnerOrPayer: Bool {
        if item.members.isEmpty { return true }
        if item.payerId.isEmpty || item.payerId == meId { return true }
        return item.members.first?.id == meId
    }

    private var hint: String {
        var all: Set<String> = picked
        if !meId.isEmpty { all.insert(meId) }
        let n: Int = Swift.max(1, all.count)
        if split == "payer" {
            return "Du betaler hele beløpet. Alle ser abonnementet, trekkdato og varsler. Bare betaleren har det i budsjettet."
        }
        let full: Double = item.cycle == "yearly" ? item.price / 12 : (item.cycle == "biennial" ? item.price / 24 : item.price)
        return "Hver betaler " + SubCalc23.kr(full / Double(n)) + "/mnd. "
            + "Alle ser abonnementet, trekkdato og varsler. Bare din del teller i ditt budsjett."
    }

    private func chip(_ mem: TaskMember17, _ t: SubTok23) -> some View {
        let me: Bool = mem.id == meId
        let on: Bool = me || picked.contains(mem.id)
        return Button {
            if me { return }
            Haptics.shared.select()
            if picked.contains(mem.id) { picked.remove(mem.id) } else { picked.insert(mem.id) }
            push()
        } label: {
            HStack(spacing: 6) {
                ZStack {
                    Circle().fill(Task37Avatars.color(mem.name))
                    Text(String(mem.name.prefix(1)).uppercased()).font(PF.ui(10, .bold)).foregroundStyle(Color.white)
                }
                .frame(width: 20, height: 20)
                Text(mem.first + (me ? " (deg)" : "")).font(PF.ui(12.5, .semibold))
            }
            .foregroundStyle(on ? t.onFg : t.fg)
            .padding(.leading, 6).padding(.trailing, 12).frame(height: 32)
            .background(on ? t.on : t.chip, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func pill(_ s: String, _ on: Bool, _ t: SubTok23, _ act: @escaping () -> Void) -> some View {
        Button {
            Haptics.shared.select()
            act()
        } label: {
            Text(s).font(PF.ui(12.5, .bold)).foregroundStyle(on ? t.onFg : t.fg)
                .padding(.horizontal, 14).frame(height: 32)
                .background(on ? t.on : t.chip, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    /// Lagrer delingen med en gang (PUT …/:id/members).
    private func push() {
        var ids: [String] = Array(picked)
        if !meId.isEmpty && !ids.contains(meId) { ids.append(meId) }
        var body: [String: Any] = ["members": ids, "split": split]
        if split == "payer" { body["payerId"] = payer.isEmpty ? meId : payer }
        let id: Int = item.id
        Task {
            do {
                _ = try await store.api.call("PUT", "/subscriptions/\(id)/members", json: body)
                try? await store.loadSubs()
            } catch let e as APIError {
                if e.status == 404 || e.status == 405 { store.flash("Serveren støtter ikke delte abonnementer ennå. Oppdater homelab.") }
                else { store.flash("Kunne ikke dele: " + e.message) }
            } catch {}
        }
    }

    private func leave() {
        Haptics.shared.warning()
        let id: Int = item.id
        Task {
            _ = try? await store.api.call("POST", "/subscriptions/\(id)/leave", json: [:])
            try? await store.loadSubs()
            store.subEdit = nil
        }
    }
}

/* ---------- Wiggle på Oversikt: skjulte kort ---------- */

enum SubHid37 {
    static var key: String { AcctScope.key("sub_home_hid") }

    static func load() -> [String] { (UserDefaults.standard.array(forKey: key) as? [String]) ?? [] }

    @MainActor static func save(_ hid: [String], _ store: Store) {
        UserDefaults.standard.set(hid, forKey: key)
        store.savePaperLayout(["subHomeHid": hid])
    }

    static func label(_ k: String) -> String {
        switch k {
        case "trials": return "Gratis prøveperioder"
        case "ai": return "AI-sparing"
        case "next7": return "Neste trekk"
        case "check": return "Sjekk"
        default: return "Kommende trekk"
        }
    }
}

/// «Legg til kort»: skjulte kort med grønn ＋.
struct Sub37AddCardsSheet: View {
    @Environment(\.paper) private var p
    let hidden: [String]
    let show: (String) -> Void
    let close: () -> Void

    var body: some View {
        let t: SubTok23 = SubTok23.of(p)
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Legg til kort").font(PF.serif(24, medium: true)).foregroundStyle(t.fg)
                Spacer(minLength: 6)
                SheetButton30(kind: .primary, title: "Ferdig") { close() }
            }
            if hidden.isEmpty {
                Text("Alle kort vises allerede. Trykk − på et kort for å skjule det.").font(PF.ui(14)).foregroundStyle(t.mut)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(hidden.enumerated()), id: \.element) { i, k in
                        Edit28AddRow(name: SubHid37.label(k), first: i == 0) { show(k) }
                    }
                }
                .background(t.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 20)
        .background(t.bg.ignoresSafeArea())
        .environment(\.colorScheme, t.dark ? .dark : .light)
    }
}
