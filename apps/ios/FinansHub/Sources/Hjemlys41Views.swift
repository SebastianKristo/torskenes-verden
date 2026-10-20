import SwiftUI
import UIKit
import ContactsUI

/* ---------------- Prompt 41: Familie → Hjemlys (fanen) – visningene ----------------
   Fasit: Familie.dc.html (fanen Hjemlys) og Hjemme trygt Varianter.dc.html → 4a Start, 4b Velg personer, 4c Klar, 4d aktiv.
   Start: «Hva vil du si fra om?» (fire valg i rutenett), AKTIVE I FAMILIEN, Glimt-forslag. Personer: søk, Husstanden / Siste
   brukt / Alle, HUSSTANDEN · VENNER MED PAPIR · ANDRE KONTAKTER, runde avkrysninger 24 pt, rader 52 pt, valgte nederst,
   «Husk valget». Klar: mål, rute, «Alt OK?»-ventetid, hva som deles hvis sen – eller valgfritt sted og «drar om ca.».
   Aktiv: Hjemlys40Active (dag/natt) + forhåndsvisning av låseskjermen. Sendt: beskjeden ordrett. */

struct Hjemlys41Tab: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var h: Hjemlys41 { Hjemlys41.shared }
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let s = m.mine, s.active || s.state == "home" {
                VStack(alignment: .leading, spacing: 12) {
                    Hjemlys41Head()
                    Hjemlys40Active(s: s)
                }
                .padding(16)
                .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                if s.active { Hjemlys41LockPreview(s: s) }
            } else {
                switch h.step {
                case "people": Hjemlys41People()
                case "ready": Hjemlys41Ready()
                case "sent": Hjemlys41SentCard()
                default: Hjemlys41Start()
                }
            }
            // Prompt 42: «Aktive i familien» og Glimt-forslaget under valgene (Family42.swift).
            VelFremmeCards42()
            Text("Ingenting deles før du er sen. Posisjon og rute slettes etter 24 timer.")
                .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
        }
        .task {
            h.restore()
            await m.load(store)
            await h.loadFriends(store)
        }
        .sheet(isPresented: Binding<Bool>(get: { h.contactPicker }, set: { (v: Bool) in h.contactPicker = v })) {
            Hjemlys41ContactPicker { (name: String, phone: String) in h.addContact(name: name, phone: phone) }
                .ignoresSafeArea()
        }
    }
}

struct Hjemlys41Head: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    var body: some View {
        HStack(spacing: 6) {
            Hjemlys41Glow(size: 18, state: m.mine?.state ?? "onTheWay")
            VStack(alignment: .leading, spacing: 1) {
                Text("VEL FREMME").font(PF.mono(10.5)).tracking(1.3).foregroundStyle(p.lab)
                Text("Et lite lys som står på til du er hjemme.").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
            Spacer(minLength: 0)
        }
    }
}

/* ---------- 4a Start ---------- */

struct Hjemlys41Start: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var h: Hjemlys41 { Hjemlys41.shared }
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Hjemlys41Head()
            Text("Hva vil du si fra om?").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(Hjemlys41.kinds, id: \.0) { (k: (String, String, String, String)) in tile(k) }
            }
            if m.suggest { Hjemlys40Suggest() }
            let others: [Hjemlys40Member] = m.household.filter { ($0.active || $0.state == "home" || $0.state == "checked_in") && !m.isMe($0) }
            if !others.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    PLabel(text: "Aktive i familien").padding(.bottom, 4)
                    ForEach(others) { (x: Hjemlys40Member) in
                        Hjemlys40MemberRow(h: x)
                            .contentShape(Rectangle())
                            .onTapGesture { if x.state == "late" { m.alertMember = x } }
                    }
                }
            }
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func tile(_ k: (String, String, String, String)) -> some View {
        let main: Bool = k.0 == "hjem"
        return Button { h.begin(k.0, store) } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(k.1).font(.system(size: 20, weight: .bold)).foregroundStyle(main ? Hjemlys40Look.gold : iconColor(k.0))
                Text(k.2).font(PF.ui(15, .bold)).foregroundStyle(main ? p.bg : p.ink)
                Text(k.3).font(PF.ui(12)).foregroundStyle(main ? p.bg.opacity(0.75) : p.mut)
                    .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
            .background(main ? p.ink : p.bg, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(main ? Color.clear : p.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(k.2 + ". " + k.3)
    }

    private func iconColor(_ k: String) -> Color {
        switch k {
        case "inn": return p.pos
        case "snart": return Color(hex: "#9a5a10")
        default: return Color(hex: "#2b5d8a")
        }
    }
}

/* ---------- 4b Hvem får beskjed? ---------- */

struct Hjemlys41People: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var h: Hjemlys41 { Hjemlys41.shared }

    var body: some View {
        let vis: [Hjemlys41Person] = h.visible(store)
        let chosen: [Hjemlys41Person] = h.chosen(store)
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button { h.back() } label: { Text("‹ Tilbake").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink) }.buttonStyle(.plain)
                Spacer()
                Button { h.next() } label: { Text("Neste").font(PF.ui(13.5, .bold)).foregroundStyle(p.lab) }
                    .buttonStyle(.plain).disabled(chosen.isEmpty).opacity(chosen.isEmpty ? 0.4 : 1)
            }
            Text("Hvem får beskjed?").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .semibold)).foregroundStyle(p.mut)
                TextField("Søk", text: Binding<String>(get: { h.query }, set: { (v: String) in h.query = v }))
                    .font(PF.ui(15)).foregroundStyle(p.ink).autocorrectionDisabled()
            }
            .padding(.horizontal, 12).frame(height: 40)
            .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            HStack(spacing: 6) {
                chip("hus", "Husstanden")
                chip("siste", "Siste brukt")
                chip("alle", "Alle")
                Spacer(minLength: 0)
                Button { Haptics.shared.tap(); h.contactPicker = true } label: {
                    Text("+ Kontakt").font(PF.ui(12.5, .bold)).foregroundStyle(p.lab)
                }
                .buttonStyle(.plain)
            }
            ForEach([("hus", "Husstanden"), ("venn", "Venner med Papir"), ("sms", "Andre kontakter")], id: \.0) { (g: (String, String)) in
                let rows: [Hjemlys41Person] = vis.filter { $0.group == g.0 }
                if !rows.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        PLabel(text: g.1).padding(.bottom, 4).padding(.top, 4)
                        ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                            row(r, first: i == 0)
                        }
                    }
                }
            }
            if vis.isEmpty {
                Text(h.filter == "siste" ? "Ingen brukt ennå. Velg fra Husstanden eller Alle." : "Ingen treff.")
                    .font(PF.ui(13)).foregroundStyle(p.mut)
            }
            Rectangle().fill(p.line).frame(height: 1)
            HStack(spacing: 10) {
                HStack(spacing: -8) {
                    ForEach(Array(chosen.prefix(4))) { (r: Hjemlys41Person) in avatar(r, size: 30) }
                }
                Text(chosen.isEmpty ? "Velg minst én" : "\(chosen.count) valgt · " + h.chosenText(store)).font(PF.ui(13, .semibold)).foregroundStyle(p.ink)
                    .lineLimit(1)
                Spacer(minLength: 4)
            }
            Toggle(isOn: Binding<Bool>(get: { h.remember }, set: { (v: Bool) in h.remember = v })) {
                Text("Husk valget").font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
            }
            .tint(p.pos)
            Button { h.next() } label: {
                Text("Neste").font(PF.ui(15, .bold)).foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 48)
                    .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(chosen.isEmpty)
            .opacity(chosen.isEmpty ? 0.4 : 1)
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func chip(_ k: String, _ n: String) -> some View {
        let on: Bool = h.filter == k
        return Button { Haptics.shared.select(); h.filter = k } label: {
            Text(n).font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 12).frame(height: 30)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func avatar(_ r: Hjemlys41Person, size: CGFloat) -> some View {
        Text(String(r.name.prefix(2))).font(PF.ui(size * 0.38, .bold)).foregroundStyle(Color.white)
            .frame(width: size, height: size)
            .background(Color(hex: r.color), in: Circle())
            .overlay(Circle().stroke(p.card, lineWidth: 2))
    }

    private func row(_ r: Hjemlys41Person, first: Bool) -> some View {
        let on: Bool = h.selected.contains(r.id)
        return Button { h.toggle(r.id) } label: {
            HStack(spacing: 12) {
                avatar(r, size: 34)
                VStack(alignment: .leading, spacing: 1) {
                    Text(r.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                    Text(r.sub).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                ZStack {
                    Circle().fill(on ? p.pos : Color.clear)
                    Circle().stroke(on ? Color.clear : p.line, lineWidth: 1.5)
                    if on { Image(systemName: "checkmark").font(.system(size: 11, weight: .heavy)).foregroundStyle(Color.white) }
                }
                .frame(width: 24, height: 24)
            }
            .frame(minHeight: 52)
            .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/* ---------- 4c Klar ---------- */

struct Hjemlys41Ready: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var h: Hjemlys41 { Hjemlys41.shared }
    @MainActor private var r: Hjemlys40Route { Hjemlys40Route.shared }
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Button { h.back() } label: { Text("‹ Personer").font(PF.ui(13.5, .semibold)).foregroundStyle(p.ink) }.buttonStyle(.plain)
                Spacer()
            }
            Text(h.kindName).font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
            if h.kind == "naa" {
                section("Mål") {
                    HStack(spacing: 6) {
                        chip("Hjem", h.dest == "hjem") { h.dest = "hjem" }
                        chip("Annet sted", h.dest == "annet") { h.dest = "annet" }
                        chip("Ikke oppgi", h.dest == "ingen") { h.dest = "ingen" }
                    }
                }
            }
            if h.isTrip && !(h.kind == "naa" && h.dest == "annet") {
                section("Til") {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Hjem" + (r.toName.isEmpty || r.toName == "Hjem" ? "" : " · " + r.toName)).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                        if !r.fromName.isEmpty {
                            Text("Fra " + r.fromName + (r.km > 0 ? " · " + String(format: "%.1f", r.km).replacingOccurrences(of: ".", with: ",") + " km" : ""))
                                .font(PF.ui(12.5)).foregroundStyle(p.mut)
                        }
                    }
                }
                VStack(spacing: 0) {
                    if r.busy && r.options.isEmpty { ProgressView().padding(12) }
                    ForEach(Array(r.options.enumerated()), id: \.element.id) { i, o in
                        Button { Haptics.shared.select(); r.picked = o.mode } label: {
                            HStack {
                                Text(o.legs.isEmpty ? o.label : o.legs.joined(separator: " + ")).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                                Spacer()
                                Text("ca. " + Hjemlys40Look.clock(o.eta)).font(PF.mono(13)).foregroundStyle(p.mut)
                                Text(r.selected?.mode == o.mode ? "✓" : " ").font(PF.ui(14, .bold)).foregroundStyle(p.pos).frame(width: 18)
                            }
                            .padding(.horizontal, 12).frame(minHeight: 46)
                            .overlay(alignment: .top) { if i > 0 { Rectangle().fill(p.line).frame(height: 1) } }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            if !h.isTrip || (h.kind == "naa" && h.dest == "annet") {
                section(h.kind == "naa" && h.dest == "annet" ? "Til" : "Der du er · valgfritt") {
                    VStack(alignment: .leading, spacing: 4) {
                        TextField(h.kind == "naa" && h.dest == "annet" ? "Adresse eller sted" : "Sted (valgfritt)", text: Binding<String>(get: { h.place }, set: { (v: String) in h.place = v }))
                            .font(PF.ui(15)).foregroundStyle(p.ink)
                            .padding(.horizontal, 12).frame(height: 42)
                            .background(p.bg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        let hint: String = Hjemlys41.calendarPlace()
                        if !hint.isEmpty && hint != h.place {
                            Button { h.place = hint } label: {
                                Text("Forslag fra kalenderen: " + hint).font(PF.ui(12)).foregroundStyle(p.lab).multilineTextAlignment(.leading)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            if h.kind == "snart" {
                section("Drar om ca.") {
                    HStack(spacing: 6) {
                        chip("15 min", h.soon == 15) { h.soon = 15 }
                        chip("30 min", h.soon == 30) { h.soon = 30 }
                        chip("1 t", h.soon == 60) { h.soon = 60 }
                        chip("Ukjent", h.soon == 0) { h.soon = 0 }
                    }
                }
            }
            if h.isTrip {
                section("Varsle hvis jeg ikke svarer på «Alt OK?»") {
                    HStack(spacing: 6) {
                        chip("5 min", h.wait == 5) { h.wait = 5 }
                        chip("15 min", h.wait == 15) { h.wait = 15 }
                        chip("30 min", h.wait == 30) { h.wait = 30 }
                    }
                }
                section("Deles bare hvis du er sen") {
                    VStack(spacing: 0) {
                        toggle("Posisjon og rute", Binding<Bool>(get: { h.sharePos }, set: { (v: Bool) in h.sharePos = v }), first: true)
                        toggle("Batteri og dekning", Binding<Bool>(get: { h.shareBat }, set: { (v: Bool) in h.shareBat = v }), first: false)
                        toggle("Hvem jeg var med", Binding<Bool>(get: { h.shareWith }, set: { (v: Bool) in h.shareWith = v }), first: false)
                    }
                    .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
            Text(whoText).font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            if !h.err.isEmpty || !m.err.isEmpty {
                Text(h.err.isEmpty ? m.err : h.err).font(PF.ui(13, .semibold)).foregroundStyle(Hjemlys40Look.red)
            }
            Button { h.go(store) } label: {
                HStack(spacing: 8) {
                    if h.busy || m.busy { ProgressView().tint(p.bg) } else { Hjemlys41Glow(size: 14) }
                    Text(startLabel).font(PF.ui(15.5, .bold))
                }
                .foregroundStyle(p.bg).frame(maxWidth: .infinity, minHeight: 52)
                .background(p.ink, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(h.busy || m.busy)
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var whoText: String {
        let nm: String = h.chosenText(store)
        if h.isTrip { return nm + " får beskjed når du er fremme." }
        let withPlace: Bool = !h.place.trimmingCharacters(in: .whitespaces).isEmpty
        return "Bare beskjeden" + (withPlace ? " og stedet" : "") + " sendes til " + nm + ". Posisjon deles ikke."
    }

    private var startLabel: String {
        if h.isTrip {
            let eta = r.selected?.eta ?? Date().addingTimeInterval(30 * 60)
            return h.kind == "naa" && h.dest == "annet" ? "Start" : "Start · fremme ca. " + Hjemlys40Look.clock(eta)
        }
        switch h.kind {
        case "inn": return "Sjekk inn"
        case "snart": return "Si fra"
        default: return "Send «drar nå»"
        }
    }

    private func section<C: View>(_ t: String, @ViewBuilder _ c: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            PLabel(text: t)
            c()
        }
    }

    private func chip(_ n: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button { Haptics.shared.select(); act() } label: {
            Text(n).font(PF.ui(13, .semibold)).foregroundStyle(on ? p.bg : p.ink).lineLimit(1)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func toggle(_ n: String, _ b: Binding<Bool>, first: Bool) -> some View {
        Toggle(isOn: b) { Text(n).font(PF.ui(14, .semibold)).foregroundStyle(p.ink) }
            .tint(p.pos)
            .padding(.horizontal, 12).frame(minHeight: 46)
            .overlay(alignment: .top) { if !first { Rectangle().fill(p.line).frame(height: 1) } }
    }
}

/* ---------- Sendt ---------- */

struct Hjemlys41SentCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var h: Hjemlys41 { Hjemlys41.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let s = h.sent {
                HStack(spacing: 8) {
                    Hjemlys41Glow(size: 18, state: s.kind == "home" ? "home" : "onTheWay")
                    Text(s.kind == "home" ? "Hjemme ✓" : "Sendt").font(PF.serif(26, medium: true)).foregroundStyle(p.ink)
                }
                Text("Til " + s.to + " · " + Hjemlys40Look.clock(s.at)).font(PF.ui(13)).foregroundStyle(p.mut)
                Text("«" + s.msg + "»").font(PF.italic(19)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                if s.kind == "snart" {
                    HStack(spacing: 8) {
                        Hjemlys40Pill(title: "+ 15 min", dark: false) { h.plus15(store) }
                        Hjemlys40Pill(title: "Drar nå", dark: true) { h.leaveNow(store) }
                    }
                }
                Button { h.done() } label: {
                    Text("Ferdig").font(PF.ui(14, .bold)).foregroundStyle(p.ink).frame(maxWidth: .infinity, minHeight: 44)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(p.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/* ---------- Forhåndsvisning av låseskjermen ---------- */

struct Hjemlys41LockPreview: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }
    let s: Hjemlys40Session

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "Slik ser det ut på låseskjermen")
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 4) {
                    Hjemlys41Glow(size: 24, state: s.state)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Vel fremme").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.white)
                        Text(m.recipientsText).font(.system(size: 11.5)).foregroundStyle(Color.white.opacity(0.75)).lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(Hjemlys40Look.clock(s.eta)).font(.system(size: 20, weight: .bold)).monospacedDigit()
                            .foregroundStyle(s.state == "late" ? Hjemlys40Look.red : Hjemlys40Look.green)
                        Text(s.state == "late" ? "\(s.lateMinutes) min over" : "om " + Hjemlys40Look.mins(Hjemlys40Look.minutesLeft(s.eta.timeIntervalSince1970)))
                            .font(.system(size: 11)).foregroundStyle(Color.white.opacity(0.7))
                    }
                    .frame(minWidth: 64, alignment: .trailing)
                }
                GeometryReader { (g: GeometryProxy) in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Hjemlys40Look.track)
                        Capsule().fill(Hjemlys40Look.green).frame(width: Swift.max(5, g.size.width * CGFloat(s.progressNow)))
                    }
                }
                .frame(height: 5)
                HStack(spacing: 8) {
                    Text("+ 10 min").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity, minHeight: 34).background(Color.white.opacity(0.12), in: Capsule())
                    Text("Jeg er hjemme").font(.system(size: 13, weight: .heavy)).foregroundStyle(Hjemlys40Look.c(0x0d1a12))
                        .frame(maxWidth: .infinity, minHeight: 34).background(Hjemlys40Look.green, in: Capsule())
                }
            }
            .padding(14)
            .background(Hjemlys40Look.c(0x14161c, 0.92), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .accessibilityElement(children: .combine)
        }
    }
}

/* ---------- Kontakter (velgeren krever ingen tillatelse) ---------- */

struct Hjemlys41ContactPicker: UIViewControllerRepresentable {
    let picked: (String, String) -> Void

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let v: CNContactPickerViewController = CNContactPickerViewController()
        v.delegate = context.coordinator
        v.displayedPropertyKeys = [CNContactPhoneNumbersKey]
        v.predicateForEnablingContact = NSPredicate(format: "phoneNumbers.@count > 0")
        return v
    }

    func updateUIViewController(_ vc: CNContactPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(picked: picked) }

    final class Coordinator: NSObject, CNContactPickerDelegate {
        let picked: (String, String) -> Void
        init(picked: @escaping (String, String) -> Void) { self.picked = picked }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            let name: String = [contact.givenName, contact.familyName].filter { !$0.isEmpty }.joined(separator: " ")
            let phone: String = contact.phoneNumbers.first?.value.stringValue ?? ""
            picked(name, phone)
        }
    }
}

/* ---------- Hjem → «POSISJON · FAMILIE · HJEMLYS»-raden ---------- */

/// Raden øverst i Posisjon · Familie når du (eller noen du følger) har aktiv Hjemlys. Trykk åpner Familie → Hjemlys.
struct Hjemlys41PosRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Hjemlys40Model { Hjemlys40Model.shared }

    static func any(_ m: Hjemlys40Model) -> Bool {
        (m.mine?.active ?? false) || m.household.contains { $0.active && !m.isMe($0) }
    }

    var body: some View {
        VStack(spacing: 6) {
            if let s = m.mine, s.active {
                row(name: "Du · " + (s.dest == "Hjem" ? "på vei hjem" : "på vei til " + s.dest),
                    sub: [Hjemlys40LockViewText.leg(s.leg), m.recipientsText].filter { !$0.isEmpty }.joined(separator: " · "),
                    time: s.state == "late" ? "+\(s.lateMinutes) min" : Hjemlys40Look.clock(s.eta), state: s.state, progress: s.progressNow)
            }
            ForEach(m.household.filter { $0.active && !m.isMe($0) }) { (h: Hjemlys40Member) in
                row(name: h.name + " · " + (h.state == "late" ? "forsinket" : "på vei hjem"), sub: h.line,
                    time: h.eta.map { Hjemlys40Look.clock($0) } ?? "", state: h.state, progress: -1)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            Haptics.shared.tap()
            store.paperGo("familie")
            FamilyModel.shared.tab = "hjemlys"
        }
    }

    private func row(name: String, sub: String, time: String, state: String, progress: Double) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Hjemlys41Glow(size: 14, state: state)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(PF.ui(13.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                    if !sub.isEmpty { Text(sub).font(PF.ui(11.5)).foregroundStyle(p.mut).lineLimit(1) }
                }
                Spacer(minLength: 4)
                Text(time).font(PF.mono(13)).foregroundStyle(state == "late" ? Hjemlys40Look.red : p.ink)
            }
            if progress >= 0 {
                GeometryReader { (g: GeometryProxy) in
                    ZStack(alignment: .leading) {
                        Capsule().fill(p.line)
                        Capsule().fill(state == "late" ? Hjemlys40Look.red : Hjemlys40Look.green).frame(width: Swift.max(4, g.size.width * CGFloat(progress)))
                    }
                }
                .frame(height: 4)
            }
        }
        .padding(10)
        .background(p.bg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

enum Hjemlys40LockViewText {
    /// Generiske etapper («Kollektiv + gå», «Gå») vises ikke.
    static func leg(_ l: String) -> String {
        let x: String = l.lowercased().trimmingCharacters(in: .whitespaces)
        if x.isEmpty || x == "kollektiv + gå" || x == "kollektiv" || x == "gå" || x == "start" { return "" }
        return l
    }
}
