import SwiftUI
import UIKit

/* ---------------- Prompt 50: Sjekk inn (erstatter Vel fremme i fanen) og 6b «Sjekket inn» (FAMIOS50) ----------------
   Fasit: Familie App.dc.html (v.sjekk, v.sendt). API: GET /api/family/checkin, POST /checkin, /checkin/request,
   /checkin/:id/pickup, /checkin/:id/reply. «På vei hjem» er dagens Vel fremme-tur (Hjemlys41Views.swift).
   Posisjonen måles én gang og sendes bare med selve innsjekken (ingen kontinuerlig deling). */

/// Utkastet beholdes mens du bytter fane.
@MainActor
@Observable
final class Fam50Draft {
    static let shared = Fam50Draft()

    var quick: String = "party"
    var custom: String = ""
    var to: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "fam50_checkin_to") ?? [])
    var remind: Date? = nil
    var remindLabel: String = "Av"
    var requestId: String? = nil
    var requestFrom: String = ""

    func saveTo() { UserDefaults.standard.set(Array(to), forKey: "fam50_checkin_to") }

    /// Første gang: alle i familien er valgt.
    func defaults(_ people: [Fam50Mini]) {
        let ids: Set<String> = Set(people.map { $0.userId })
        let kept: Set<String> = to.intersection(ids)
        to = kept.isEmpty ? ids : kept
    }
}

struct Fam50CheckinTab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Fam50Model { Fam50Model.shared }
    @MainActor private var d: Fam50Draft { Fam50Draft.shared }
    @State private var whereMenu: Bool = false
    @State private var customWhere: Bool = false
    @State private var whereText: String = ""
    @State private var customMsg: Bool = false
    @State private var msgText: String = ""
    @State private var askConfirm: Bool = false
    @State private var sending: Bool = false

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Fam50Title(title: "Sjekk inn", sub: "Si fra hvor du er og at alt er bra").padding(.top, 48).padding(.bottom, 12)
                if Hjemlys41PosRow.any(Hjemlys40Model.shared) { VelFremmeStatus42().padding(.horizontal, 14).padding(.bottom, 8) }
                ForEach(m.requests) { (r: Fam50Checkin) in Fam50RequestCard(req: r).padding(.horizontal, 14).padding(.bottom, 8) }
                Fam50CheckinForm(whereMenu: $whereMenu, customMsg: $customMsg, msgText: $msgText).padding(.horizontal, 14)
                sendButton(t).padding(.horizontal, 14).padding(.top, 12)
                secondary(t).padding(.horizontal, 14).padding(.top, 8)
                Fam50TodayList(items: m.log, title: "I DAG I FAMILIEN", empty: "Ingen innsjekker i dag ennå").padding(.top, 16)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await m.refreshSuggestion(store) }
        .task {
            await m.refreshSuggestion(store)
            d.defaults(m.recipients)
        }
        .confirmationDialog("Hvor er du?", isPresented: $whereMenu, titleVisibility: .visible) {
            ForEach(m.suggestions) { (s: Fam50Suggest) in
                Button(s.label.isEmpty ? s.title : s.label) { m.suggestion = s }
            }
            Button("Skriv selv …") { whereText = m.suggestion?.title ?? ""; customWhere = true }
            Button("Oppdater posisjon") { Task { await m.refreshSuggestion(store) } }
            Button("Avbryt", role: .cancel) {}
        }
        .alert("Hvor er du?", isPresented: $customWhere) {
            TextField("F.eks. Hos Mari", text: $whereText)
            Button("Bruk") {
                let s: String = whereText.trimmingCharacters(in: .whitespaces)
                if !s.isEmpty { m.suggestion = Fam50Suggest(custom: s) }
            }
            Button("Avbryt", role: .cancel) {}
        }
        .alert("Hva vil du si?", isPresented: $customMsg) {
            TextField("Egen tekst", text: $msgText)
            Button("Bruk") {
                let s: String = msgText.trimmingCharacters(in: .whitespaces)
                if !s.isEmpty { d.custom = s; d.quick = "custom" }
            }
            Button("Avbryt", role: .cancel) {}
        }
        .confirmationDialog("Be " + names + " sjekke inn?", isPresented: $askConfirm, titleVisibility: .visible) {
            Button("Send forespørsel") { Task { await m.askCheckIn(store, to: Array(d.to)) } }
            Button("Avbryt", role: .cancel) {}
        } message: { Text("De får et varsel og kan svare med ett trykk.") }
    }

    private var chosen: [Fam50Mini] { m.recipients.filter { d.to.contains($0.userId) } }

    /// «Ingrid», «Ingrid og Pål», «Ingrid, Pål og Kari».
    private var names: String {
        let n: [String] = chosen.map { $0.first }
        if n.count <= 1 { return n.first ?? "" }
        return n.dropLast().joined(separator: ", ") + " og " + (n.last ?? "")
    }

    private var sendTitle: String {
        if chosen.isEmpty { return "Velg hvem som får beskjed" }
        if d.requestId != nil { return "Svar " + names }
        if d.quick == "pickup" { return "Send «Hent meg» til " + names }
        return "Sjekk inn til " + names
    }

    private func sendButton(_ t: Fam50Tok) -> some View {
        Button { send() } label: {
            Text(sending ? "Sender …" : sendTitle).font(PF.ui(16, .heavy)).foregroundStyle(t.onPill).lineLimit(1).minimumScaleFactor(0.7)
                .padding(.horizontal, 18).frame(maxWidth: .infinity).frame(height: 56)
                .background(Capsule().fill(d.quick == "pickup" && !chosen.isEmpty ? t.lab : t.pill))
                .opacity(chosen.isEmpty ? 0.5 : 1)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(chosen.isEmpty || sending)
    }

    private func secondary(_ t: Fam50Tok) -> some View {
        HStack(spacing: 8) {
            outline("På vei hjem", t) { Fam50Nav.shared.push(.vei) }
            outline("Be noen sjekke inn", t) {
                if chosen.isEmpty { store.flash("Velg hvem du vil spørre under «Til»"); return }
                askConfirm = true
            }
        }
    }

    private func outline(_ n: String, _ t: Fam50Tok, _ f: @escaping () -> Void) -> some View {
        Button { Haptics.shared.tap(); f() } label: {
            Text(n).font(PF.ui(13, .bold)).foregroundStyle(t.ink).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity).frame(height: 44)
                .overlay(Capsule().stroke(t.dash, lineWidth: 1.5))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func send() {
        guard !chosen.isEmpty else { return }
        let to: [String] = chosen.map { $0.userId }
        let quick: String? = d.quick == "custom" ? nil : d.quick
        // Teksten på brikken sendes med («Er på bursdag, alt bra» er tilpasset hendelsen).
        let text: String? = d.quick == "custom" ? d.custom : m.quick.first(where: { $0.id == d.quick })?.text
        let req: String? = d.requestId
        let rem: Date? = d.remind
        sending = true
        d.saveTo()
        Task { @MainActor in
            defer { sending = false }
            let ok: Bool = await m.checkIn(store, to: to, quick: quick, text: text, place: m.suggestion, remindAt: rem, requestId: req)
            if ok {
                d.requestId = nil
                d.requestFrom = ""
                d.remind = nil
                d.remindLabel = "Av"
                Fam50Nav.shared.push(.sendt)
            }
        }
    }
}

/// Selve kortet: Hvor, Hva vil du si?, Til og påminnelse.
struct Fam50CheckinForm: View {
    @Environment(\.paper) private var p
    @Binding var whereMenu: Bool
    @Binding var customMsg: Bool
    @Binding var msgText: String
    @MainActor private var m: Fam50Model { Fam50Model.shared }
    @MainActor private var d: Fam50Draft { Fam50Draft.shared }

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        VStack(alignment: .leading, spacing: 14) {
            whereRow(t)
            VStack(alignment: .leading, spacing: 8) {
                Fam50Label(text: "HVA VIL DU SI?", color: t.mut)
                messages(t)
            }
            VStack(alignment: .leading, spacing: 8) {
                Fam50Label(text: d.requestId != nil ? "SVAR TIL" : "TIL", color: t.mut)
                recipients(t)
            }
            reminder(t)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(t.card))
    }

    private func whereRow(_ t: Fam50Tok) -> some View {
        let s: Fam50Suggest? = m.suggestion
        return HStack(spacing: 12) {
            Fam22Glyph(d: "M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", size: 22, stroke: 2, color: Color.white)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(hex: "#7a3b6b")))
            VStack(alignment: .leading, spacing: 1) {
                Text(s?.title.isEmpty == false ? (s?.title ?? "") : "Finner hvor du er …").font(PF.ui(16, .bold)).foregroundStyle(t.ink).lineLimit(1)
                Text(s?.line ?? "Trykk Endre for å skrive selv").font(PF.ui(12.5)).foregroundStyle(t.mut).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { Haptics.shared.tap(); whereMenu = true } label: {
                Text("Endre").font(PF.ui(13, .bold)).foregroundStyle(t.lab).frame(minHeight: 36).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func messages(_ t: Fam50Tok) -> some View {
        Flow(spacing: 6) {
            ForEach(m.quick) { (q: Fam50Quick) in
                chip(q.text, d.quick == q.id, t) { d.quick = q.id }
            }
            chip(d.custom.isEmpty ? "Egen tekst …" : d.custom, d.quick == "custom", t) {
                msgText = d.custom
                customMsg = true
            }
        }
    }

    private func chip(_ n: String, _ on: Bool, _ t: Fam50Tok, _ f: @escaping () -> Void) -> some View {
        Button { Haptics.shared.select(); f() } label: {
            Text(n).font(PF.ui(13, .bold)).foregroundStyle(on ? t.onPill : t.ink).lineLimit(1)
                .padding(.horizontal, 14).frame(height: 38)
                .background(Capsule().fill(on ? t.pill : t.card))
                .overlay(Capsule().stroke(on ? t.pill : t.dash.opacity(0.8), lineWidth: 1.5))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func recipients(_ t: Fam50Tok) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 14) {
                ForEach(m.recipients) { (r: Fam50Mini) in recipient(r, t) }
                if m.recipients.isEmpty {
                    Text("Ingen andre i familien ennå").font(PF.ui(13)).foregroundStyle(t.mut)
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.hidden)
    }

    private func recipient(_ r: Fam50Mini, _ t: Fam50Tok) -> some View {
        let on: Bool = d.to.contains(r.userId)
        return Button {
            Haptics.shared.select()
            if on { d.to.remove(r.userId) } else { d.to.insert(r.userId) }
        } label: {
            VStack(spacing: 4) {
                Fam50Avatar(mini: r, size: 46)
                    .overlay(alignment: .bottomTrailing) {
                        if on {
                            Text("✓").font(PF.ui(11, .heavy)).foregroundStyle(Color.white).frame(width: 20, height: 20)
                                .background(Circle().fill(Color(hex: "#2f7d4f"))).overlay(Circle().stroke(t.card, lineWidth: 2))
                                .offset(x: 2, y: 2)
                        }
                    }
                Text(r.first).font(PF.ui(12.5, .semibold)).foregroundStyle(t.ink).lineLimit(1)
            }
            .opacity(on ? 1 : 0.45)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(r.first)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func reminder(_ t: Fam50Tok) -> some View {
        HStack(spacing: 10) {
            Text("Minn meg på å sjekke inn igjen").font(PF.ui(13.5, .semibold)).foregroundStyle(t.ink).frame(maxWidth: .infinity, alignment: .leading)
            Menu {
                Button("Av") { d.remind = nil; d.remindLabel = "Av" }
                ForEach(Fam50CheckinForm.options()) { (o: Fam50RemindOpt) in
                    Button(o.label) { d.remind = o.at; d.remindLabel = o.label }
                }
            } label: {
                Text(d.remindLabel).font(PF.ui(12.5, .bold)).foregroundStyle(t.ink).padding(.horizontal, 12).frame(height: 30)
                    .background(Capsule().fill(t.chip))
            }
        }
        .padding(.top, 12)
        .overlay(alignment: .top) { Rectangle().fill(t.line).frame(height: 1) }
    }

    /// Om 30 min, om 1 time, om 2 timer og noen faste klokkeslett i kveld (innen 24 t).
    static func options() -> [Fam50RemindOpt] {
        let now: Date = Date()
        var out: [Fam50RemindOpt] = [Fam50RemindOpt(label: "Om 30 min", at: now.addingTimeInterval(1800)),
                                     Fam50RemindOpt(label: "Om 1 time", at: now.addingTimeInterval(3600)),
                                     Fam50RemindOpt(label: "Om 2 timer", at: now.addingTimeInterval(7200))]
        let cal: Calendar = Calendar.current
        for h in [21, 22, 23] {
            if let d = cal.date(bySettingHour: h, minute: 0, second: 0, of: now), d.timeIntervalSince(now) > 2.5 * 3600 {
                out.append(Fam50RemindOpt(label: "kl. " + String(h) + ":00", at: d))
            }
        }
        return out
    }
}

struct Fam50RemindOpt: Identifiable {
    var id: String { label }
    let label: String
    let at: Date
}

/// «Pål ber deg sjekke inn» – svar med 👍 Alt bra eller en egen innsjekk.
struct Fam50RequestCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let req: Fam50Checkin

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        HStack(spacing: 10) {
            Fam50Avatar(mini: req.from, size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(req.title).font(PF.ui(14, .bold)).foregroundStyle(t.ink).lineLimit(2)
                Text((req.text.isEmpty ? "Sendt" : req.text) + " · " + req.time).font(PF.ui(12)).foregroundStyle(t.lab).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { Task { _ = await Fam50Model.shared.reply(store, req.id, "ok") } } label: {
                Text("👍 Alt bra").font(PF.ui(12.5, .bold)).foregroundStyle(t.onPill).padding(.horizontal, 12).frame(height: 34)
                    .background(Capsule().fill(t.pill))
            }
            .buttonStyle(.plain)
            Button { answer() } label: {
                Text("Svar").font(PF.ui(12.5, .bold)).foregroundStyle(t.ink).padding(.horizontal, 12).frame(height: 34)
                    .overlay(Capsule().stroke(t.dash, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(t.card))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(t.lab.opacity(0.5), lineWidth: 1.5))
        .onAppear { Fam50Model.shared.seen(store, req.id) }
    }

    private func answer() {
        Haptics.shared.tap()
        let d: Fam50Draft = Fam50Draft.shared
        d.requestId = req.id
        d.requestFrom = req.from.userId
        d.to = [req.from.userId]
        if d.quick == "pickup" { d.quick = "arrived" }
    }
}

/* ---------- 6b · Etter sending ---------- */

struct Fam50Sent: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Fam50Model { Fam50Model.shared }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Fam50Title(title: "Sjekk inn", sub: "").padding(.top, 48).padding(.bottom, 12)
                if let c = m.lastSent ?? m.latest {
                    Fam50SentCard(c: c).padding(.horizontal, 14)
                }
                Fam50TodayList(items: m.log, title: "I DAG I FAMILIEN", empty: "Ingen innsjekker i dag ennå").padding(.top, 16)
            }
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .refreshable { await m.loadCheckin(store) }
    }
}

/// Mørkt kort: «Sjekket inn 19:42 · Sett av Ingrid», meldingen og stedet, påminnelse, «Hent meg» og «Sjekk inn igjen».
struct Fam50SentCard: View {
    @Environment(Store.self) private var store
    let c: Fam50Checkin

    var body: some View {
        let msg: String = "«" + c.text + "»" + (c.placeLabel.isEmpty ? "" : " · " + c.placeLabel)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Text("✓").font(PF.ui(14, .heavy)).foregroundStyle(Color.white).frame(width: 28, height: 28).background(Circle().fill(Color(hex: "#2f7d4f")))
                Text(c.title.isEmpty ? "Sjekket inn " + c.time : c.title).font(PF.ui(16, .bold)).foregroundStyle(Color.white).lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(c.seenText).font(PF.ui(12.5)).foregroundStyle(Color.white.opacity(0.7)).lineLimit(1)
            }
            Text(msg).font(PF.serif(22, medium: true)).foregroundStyle(Color.white).fixedSize(horizontal: false, vertical: true)
            if !c.reminderText.isEmpty {
                Text(c.reminderText.replacingOccurrences(of: "Påminnelse ", with: "Påminnelse om ny innsjekk kl. ")).font(PF.ui(12.5)).foregroundStyle(Color.white.opacity(0.75))
            }
            HStack(spacing: 8) {
                Button { Task { await Fam50Model.shared.pickup(store, c) } } label: {
                    Text("Hent meg").font(PF.ui(13.5, .bold)).foregroundStyle(Color(hex: "#1b1a17")).frame(maxWidth: .infinity).frame(height: 44)
                        .background(Capsule().fill(Color.white))
                }
                .buttonStyle(.plain)
                .disabled(c.kind == "pickup")
                Button { Fam50Nav.shared.back() } label: {
                    Text("Sjekk inn igjen").font(PF.ui(13.5, .bold)).foregroundStyle(Color.white).frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().stroke(Color.white.opacity(0.35), lineWidth: 1.5))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(Color(hex: "#1b1a17")))
    }
}

/* ---------- «På vei hjem» (dagens Vel fremme-tur) ---------- */

struct Fam50HomeTrip: View {
    @Environment(\.paper) private var p

    var body: some View {
        let t: Fam50Tok = Fam50Tok.of(p)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Fam50TopPill(title: "‹ Sjekk inn") { Fam50Nav.shared.back() }
                    Spacer()
                }
                .frame(height: 40)
                Text("På vei hjem").font(PF.serif(38, medium: true)).foregroundStyle(t.ink).padding(.horizontal, 4)
                Hjemlys41Tab()
            }
            .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
    }
}
