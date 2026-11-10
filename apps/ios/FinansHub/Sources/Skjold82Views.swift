import SwiftUI
import UIKit

/* ---------------- Prompt 82 (CHKIOS): «Sjekk ut», «Brukt i» og Produkter i Skjold Lab ----------------
 Delsiden: «Sjekk ut» → ark med antall (±, maks lager), velg produkt (aktive + «Nytt produkt …»), valgfritt notat → «Sjekk ut».
 Toast med «Angre». Seksjonen «Brukt i» viser produktene delen er sjekket ut til (trykk → produktet).
 Produkter (⋯-menyen og kortet på siden): liste med navn, status, antall deler og kostnad; produktsiden viser stykklista
 (bilde, navn, antall, plassering der delen kom fra) med «Sjekk inn» per linje, «Marker som ferdig», «Gi nytt navn» og «Slett».
 Plukklista: «Til produkt: [velg/ingen]» over «Ta ut av lager». */

/* ---------- Delsiden ---------- */

/// «Sjekk ut» på delsiden.
struct Skj82CheckoutButton: View {
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @MainActor private var k: Skjold82 { Skjold82.shared }
    let part: Skj76Part

    var body: some View {
        if !k.missing {
            Skj76Button(title: "Sjekk ut", icon: "shippingbox.and.arrow.backward") {
                Haptics.shared.tap()
                m.sheet = .checkout(part.id)
            }
            .disabled(part.qty <= 0)
            .opacity(part.qty <= 0 ? 0.5 : 1)
            .accessibilityLabel(part.qty <= 0 ? "Sjekk ut – tomt på lager" : "Sjekk ut til et produkt")
        }
    }
}

/// «Brukt i»: produktene delen er sjekket ut til (netto > 0).
struct Skj82UsedIn: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @MainActor private var k: Skjold82 { Skjold82.shared }
    let id: String
    var unit: String = "stk"

    var body: some View {
        let list: [Skj82Used] = k.usedIn[id] ?? []
        if !list.isEmpty {
            PCard {
                VStack(alignment: .leading, spacing: 8) {
                    PLabel(text: "Brukt i")
                    ForEach(list) { (u: Skj82Used) in row(u) }
                }
            }
        }
    }

    private func row(_ u: Skj82Used) -> some View {
        Button {
            Haptics.shared.tap()
            m.sheet = .project(u.projectId)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "shippingbox").font(.system(size: 13)).foregroundStyle(p.lab)
                Text(u.name).font(PF.ui(14.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                if u.status == "ferdig" { Skj76Badge(text: "Ferdig") }
                Spacer(minLength: 6)
                Text(Skjold76.num(u.qty) + " " + unit).font(PF.mono(13)).foregroundStyle(p.ink)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(p.mut)
            }
            .frame(minHeight: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(u.name + ", " + Skjold76.num(u.qty) + " " + unit)
    }
}

/* ---------- Sjekk ut ---------- */

struct Skj82Checkout: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @MainActor private var k: Skjold82 { Skjold82.shared }
    let partId: String
    @State private var qty: Int = 1
    @State private var target: Skj82Target = Skj82Target()
    @State private var note: String = ""

    var body: some View {
        let x: Skj76Part? = m.part(partId)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "Sjekk ut", title: x?.name ?? "Del")
                if let x {
                    amount(x)
                    PCard {
                        VStack(alignment: .leading, spacing: 10) {
                            PLabel(text: "Til produkt")
                            Skj82ProjectPicker(target: $target)
                        }
                    }
                    PCard {
                        VStack(alignment: .leading, spacing: 6) {
                            PLabel(text: "Notat (valgfritt)")
                            TextField("F.eks. «til regnsensoren»", text: $note)
                                .font(PF.ui(15)).foregroundStyle(p.ink)
                        }
                    }
                    if !k.error.isEmpty { Playback44Note(text: k.error, red: true) }
                    Skj76Button(title: k.busy ? "Sjekker ut …" : "Sjekk ut", icon: "checkmark", filled: true) { go(x) }
                        .disabled(k.busy || !target.valid || x.qty <= 0)
                        .opacity(target.valid ? 1 : 0.5)
                } else {
                    ProgressView().padding(40)
                }
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .task {
            k.error = ""
            if k.projects.isEmpty { await k.load(store) }
            if target.projectId.isEmpty && target.newName.isEmpty, let first = k.active.first { target.projectId = first.id }
        }
    }

    private func amount(_ x: Skj76Part) -> some View {
        PCard {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    PLabel(text: "Antall")
                    Text("\(qty) " + x.unit).font(PF.serif(30, medium: true)).foregroundStyle(p.ink).lineLimit(1)
                    Text("På lager: " + x.qtyText).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer()
                step("minus", -1, x)
                step("plus", 1, x)
            }
        }
    }

    private func step(_ icon: String, _ d: Int, _ x: Skj76Part) -> some View {
        let top: Int = Skjold82.clamp(Int.max / 2, stock: x.qty)
        let off: Bool = d < 0 ? qty <= 1 : qty >= top
        return Button {
            Haptics.shared.tick()
            qty = Skjold82.clamp(qty + d, stock: x.qty)
        } label: {
            Image(systemName: icon).font(.system(size: 18, weight: .bold)).foregroundStyle(p.ink)
                .frame(width: 48, height: 48).overlay(Circle().stroke(p.line, lineWidth: 1)).contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(off)
        .opacity(off ? 0.4 : 1)
        .accessibilityLabel(d < 0 ? "Én færre" : "Én til")
    }

    private func go(_ x: Skj76Part) {
        let take: Skj82Take = Skj82Take(partId: x.id, qty: Double(qty), name: x.name, unit: x.unit)
        let t: Skj82Target = target
        let n: String = note
        Task { @MainActor in
            let ok: Bool = await k.checkout([take], to: t, note: n, store)
            if ok { m.sheet = .part(x.id) }
        }
    }
}

/// Velg produkt: aktive produkter + «Nytt produkt …» med navnefelt (tom projectId = nytt produkt).
struct Skj82ProjectPicker: View {
    @Environment(\.paper) private var p
    @MainActor private var k: Skjold82 { Skjold82.shared }
    @Binding var target: Skj82Target

    var body: some View {
        let fresh: Bool = target.projectId.isEmpty
        VStack(alignment: .leading, spacing: 0) {
            ForEach(k.active) { (x: Skj82Project) in
                option(x.name, sub: Skjold82.partsText(x), on: target.projectId == x.id) {
                    target = Skj82Target(projectId: x.id, newName: target.newName)
                }
                Divider().overlay(p.line)
            }
            option("Nytt produkt …", sub: "", on: fresh) {
                target = Skj82Target(projectId: "", newName: target.newName)
            }
            if fresh {
                TextField("Navn, f.eks. Værstasjon", text: Binding<String>(get: { target.newName }, set: { (v: String) in
                    target = Skj82Target(projectId: "", newName: String(v.prefix(Skjold82.maxName)))
                }))
                .font(PF.ui(15)).foregroundStyle(p.ink)
                .padding(.horizontal, 12).frame(height: 44)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
                .padding(.top, 6)
            }
        }
    }

    private func option(_ t: String, sub: String, on: Bool, _ act: @escaping () -> Void) -> some View {
        Button {
            Haptics.shared.tick()
            act()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: on ? "largecircle.fill.circle" : "circle").foregroundStyle(on ? p.lab : p.mut)
                Text(t).font(PF.ui(15, on ? .semibold : .regular)).foregroundStyle(p.ink).lineLimit(1)
                Spacer(minLength: 6)
                if !sub.isEmpty { Text(sub).font(PF.mono(10.5)).foregroundStyle(p.mut).lineLimit(1) }
            }
            .frame(minHeight: 42)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/* ---------- Plukklista: «Til produkt» ---------- */

/// «Til produkt: [velg/ingen]» over «Ta ut av lager».
struct Skj82PickTarget: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Skjold82 { Skjold82.shared }
    @State private var asking: Bool = false
    @State private var name: String = ""

    var body: some View {
        if !k.missing {
            HStack(spacing: 8) {
                Text("Til produkt:").font(PF.ui(13.5)).foregroundStyle(p.mut)
                Menu {
                    Button("Ingen") { k.pickTarget = nil }
                    ForEach(k.active) { (x: Skj82Project) in
                        Button(x.name) { k.pickTarget = Skj82Target(projectId: x.id, newName: "") }
                    }
                    Button("Nytt produkt …") { name = ""; asking = true }
                } label: {
                    HStack(spacing: 4) {
                        Text(label).font(PF.ui(14, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 10, weight: .bold)).foregroundStyle(p.mut)
                    }
                }
                Spacer(minLength: 0)
            }
            .alert("Nytt produkt", isPresented: $asking) {
                TextField("Navn", text: $name)
                Button("Velg") {
                    let n: String = Skjold82.clean(name)
                    k.pickTarget = n.isEmpty ? nil : Skj82Target(projectId: "", newName: n)
                }
                Button("Avbryt", role: .cancel) {}
            } message: {
                Text("Produktet opprettes når du tar delene ut av lager.")
            }
            .task { if k.projects.isEmpty { await k.load(store) } }
        }
    }

    @MainActor private var label: String {
        guard let t = k.pickTarget else { return "ingen" }
        if !t.projectId.isEmpty { return k.project(t.projectId)?.name ?? "Produkt" }
        return t.newName + " (nytt)"
    }
}

/* ---------- Produkter ---------- */

/// Kortet på Skjold Lab-siden: «Produkter · 2 aktive».
struct Skj82Entry: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @MainActor private var k: Skjold82 { Skjold82.shared }

    var body: some View {
        if !k.missing {
            Button {
                Haptics.shared.tap()
                m.sheet = .projects
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "shippingbox").font(.system(size: 16, weight: .semibold)).foregroundStyle(p.lab)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Produkter").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                        Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(p.mut)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .glass50Card(p, radius: 18)
            .accessibilityLabel("Produkter, " + sub)
        }
    }

    @MainActor private var sub: String {
        let a: Int = k.active.count
        if k.projects.isEmpty { return "Sjekk ut deler til det du bygger" }
        return (a == 1 ? "1 aktivt" : "\(a) aktive") + " · \(k.finished.count) ferdige"
    }
}

struct Skj82ProjectsSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @MainActor private var k: Skjold82 { Skjold82.shared }
    @State private var name: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Skj76SheetTop(kicker: "Skjold Lab", title: "Produkter")
                Text("Deler du sjekker ut trekkes fra lageret og huskes på produktet de gikk til.")
                    .font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                newCard
                if k.loading && k.projects.isEmpty { ProgressView().frame(maxWidth: .infinity).padding(24) }
                if !k.active.isEmpty { section("Aktive", k.active) }
                if !k.finished.isEmpty { section("Ferdige", k.finished) }
                if !k.loading && k.projects.isEmpty {
                    PCard {
                        Text("Ingen produkter ennå. Opprett ett her, eller trykk «Sjekk ut» på en del.")
                            .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .refreshable { await k.load(store) }
        .task { await k.load(store) }
    }

    private var newCard: some View {
        HStack(spacing: 8) {
            TextField("Nytt produkt, f.eks. Værstasjon", text: Binding<String>(get: { name }, set: { (v: String) in name = String(v.prefix(Skjold82.maxName)) }))
                .font(PF.ui(15)).foregroundStyle(p.ink)
                .submitLabel(.done)
                .onSubmit { add() }
                .padding(.horizontal, 12).frame(height: 44)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
            Button { add() } label: {
                Image(systemName: "plus").font(.system(size: 16, weight: .bold)).foregroundStyle(p.onLab)
                    .frame(width: 44, height: 44).background(p.lab, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(Skjold82.clean(name).isEmpty)
            .accessibilityLabel("Opprett produkt")
        }
    }

    private func add() {
        let n: String = name
        if Skjold82.clean(n).isEmpty { return }
        Task { @MainActor in
            if let id = await k.create(n, notes: "", store) {
                name = ""
                m.sheet = .project(id)
            }
        }
    }

    private func section(_ title: String, _ list: [Skj82Project]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: title).padding(.leading, 4)
            VStack(spacing: 0) {
                ForEach(Array(list.enumerated()), id: \.element.id) { (i: Int, x: Skj82Project) in
                    if i > 0 { Divider().overlay(p.line) }
                    row(x)
                }
            }
            .glass50Card(p, radius: 20)
        }
    }

    private func row(_ x: Skj82Project) -> some View {
        Button {
            Haptics.shared.tap()
            m.sheet = .project(x.id)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(x.name).font(PF.ui(15.5, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        if x.done { Skj76Badge(text: "Ferdig") }
                    }
                    Text(Skjold82.partsText(x)).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                }
                Spacer(minLength: 6)
                Text(Skjold82.costText(x.cost)).font(PF.mono(13)).foregroundStyle(p.ink).lineLimit(1)
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(x.name + ", " + Skjold82.statusText(x.status) + ", " + Skjold82.partsText(x))
    }
}

/// Produktsiden: stykkliste, «Sjekk inn» per linje, «Marker som ferdig», «Gi nytt navn» og «Slett».
struct Skj82ProjectSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    @MainActor private var k: Skjold82 { Skjold82.shared }
    let id: String
    @State private var renaming: Bool = false
    @State private var newName: String = ""
    @State private var confirm: Bool = false

    var body: some View {
        let x: Skj82Project? = k.project(id)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Button {
                        m.sheet = .projects
                    } label: {
                        Label("Produkter", systemImage: "chevron.left").font(PF.ui(13.5, .semibold)).foregroundStyle(p.lab)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                Skj76SheetTop(kicker: x.map { Skjold82.statusText($0.status) } ?? "Produkt", title: x?.name ?? "Produkt")
                if let x {
                    summary(x)
                    if !x.notes.isEmpty {
                        PCard { Text(x.notes).font(PF.ui(14)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true) }
                    }
                    bom
                    actions(x)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(16)
        }
        .background(p.bg.ignoresSafeArea())
        .refreshable { await k.loadProject(id, store) }
        .task { await k.loadProject(id, store) }
        .alert("Gi nytt navn", isPresented: $renaming) {
            TextField("Navn", text: $newName)
            Button("Lagre") {
                let n: String = newName
                Task { @MainActor in await k.rename(id, n, store) }
            }
            Button("Avbryt", role: .cancel) {}
        }
        .confirmationDialog("Slette «" + (x?.name ?? "produktet") + "»?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Slett", role: .destructive) {
                Task { @MainActor in
                    let ok: Bool = await k.delete(id, store)
                    if ok { m.sheet = .projects }
                }
            }
            Button("Avbryt", role: .cancel) {}
        } message: {
            Text("Delene er sjekket inn, så lageret endres ikke.")
        }
    }

    private func summary(_ x: Skj82Project) -> some View {
        let gs: [Skj82Group] = k.groups(id)
        let units: Double = gs.reduce(0) { $0 + $1.left }
        let n: Int = gs.filter { $0.left > 0 }.count
        return PCard {
            HStack(alignment: .top, spacing: 12) {
                fact("Deler", "\(n)")
                fact("Stk", Skjold76.num(units))
                fact("Kostnad", Skjold82.costText(x.cost))
            }
        }
    }

    private func fact(_ t: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            PLabel(text: t)
            Text(v).font(PF.serif(22, medium: true)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var bom: some View {
        let gs: [Skj82Group] = k.groups(id)
        VStack(alignment: .leading, spacing: 8) {
            PLabel(text: "Stykkliste").padding(.leading, 4)
            if gs.isEmpty {
                PCard {
                    Text("Ingen deler er sjekket ut hit ennå. Åpne en del og trykk «Sjekk ut», eller bruk plukklista.")
                        .font(PF.ui(13.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(gs.enumerated()), id: \.element.id) { (i: Int, g: Skj82Group) in
                        if i > 0 { Divider().overlay(p.line) }
                        Skj82GroupRow(group: g, projectId: id)
                    }
                }
                .glass50Card(p, radius: 20)
            }
        }
    }

    private func actions(_ x: Skj82Project) -> some View {
        let locked: Bool = k.hasActive(id)
        return VStack(spacing: 8) {
            Skj76Button(title: x.done ? "Gjør aktiv igjen" : "Marker som ferdig", icon: x.done ? "arrow.uturn.backward" : "checkmark.seal", filled: !x.done) {
                Task { @MainActor in await k.setDone(id, !x.done, store) }
            }
            Skj76Button(title: "Gi nytt navn", icon: "pencil") {
                newName = x.name
                renaming = true
            }
            Skj76Button(title: "Slett", icon: "trash", danger: true) { confirm = true }
                .disabled(locked)
                .opacity(locked ? 0.5 : 1)
            if locked {
                Text("Sjekk inn alle delene før produktet kan slettes.").font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
        }
    }
}

/// Én del i stykklista: bilde, navn, antall ute, plassering og linjene med «Sjekk inn».
struct Skj82GroupRow: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Skjold76 { Skjold76.shared }
    let group: Skj82Group
    let projectId: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Haptics.shared.tap()
                m.sheet = .part(group.partId)
            } label: {
                HStack(spacing: 12) {
                    Skj76Thumb(path: group.thumbUrl, size: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(group.name.isEmpty ? "Del" : group.name).font(PF.ui(15, .semibold)).foregroundStyle(p.ink).lineLimit(1)
                        Text(group.loc.isEmpty ? "Uten plass" : group.loc).font(PF.mono(10.5)).foregroundStyle(group.loc.isEmpty ? p.mut : p.lab).lineLimit(1)
                    }
                    Spacer(minLength: 6)
                    Text(Skjold76.num(group.left) + " " + group.unit).font(PF.mono(13.5)).foregroundStyle(group.left > 0 ? p.ink : p.mut).lineLimit(1)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            ForEach(group.lines) { (l: Skj82Line) in
                Skj82LineRow(line: l, projectId: projectId)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }
}

/// Én utsjekking: «3 stk · 10. nov» og «Sjekk inn» (antall ±).
struct Skj82LineRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var k: Skjold82 { Skjold82.shared }
    let line: Skj82Line
    let projectId: String
    @State private var editing: Bool = false
    @State private var n: Int = 1

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(text).font(PF.ui(12.5)).foregroundStyle(p.mut).lineLimit(1)
                Spacer(minLength: 6)
                if line.left > 0 && !editing {
                    Button("Sjekk inn") {
                        Haptics.shared.tick()
                        n = Swift.max(1, Int(line.left.rounded(.down)))
                        editing = true
                    }
                    .font(PF.ui(13, .bold)).foregroundStyle(p.lab).buttonStyle(.plain)
                }
            }
            if editing { stepper }
        }
        .padding(.leading, 60)
    }

    private var text: String {
        var t: String = Skjold76.num(line.qty) + " " + line.unit
        if let d = line.at { t += " · " + JS.fmt(d, "d. MMM") }
        if line.returnedQty > 0 { t += " · " + Skjold76.num(line.returnedQty) + " sjekket inn" }
        if !line.note.isEmpty { t += " · " + line.note }
        return t
    }

    private var top: Int { Swift.max(1, Int(line.left.rounded(.down))) }

    private var stepper: some View {
        HStack(spacing: 10) {
            step("minus", -1)
            Text("\(n) " + line.unit).font(PF.mono(14)).foregroundStyle(p.ink).frame(minWidth: 52)
            step("plus", 1)
            Spacer(minLength: 4)
            Button("Avbryt") { editing = false }
                .font(PF.ui(13, .semibold)).foregroundStyle(p.mut).buttonStyle(.plain)
            Button("Sjekk inn") {
                let q: Double = Double(n)
                Task { @MainActor in
                    await k.giveBack(line, qty: q, projectId: projectId, store)
                    editing = false
                }
            }
            .font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
            .padding(.horizontal, 12).frame(height: 32)
            .background(p.ink, in: Capsule())
            .buttonStyle(.plain)
            .disabled(k.busy)
        }
    }

    private func step(_ icon: String, _ d: Int) -> some View {
        let off: Bool = d < 0 ? n <= 1 : n >= top
        return Button {
            Haptics.shared.tick()
            n = Swift.max(1, Swift.min(top, n + d))
        } label: {
            Image(systemName: icon).font(.system(size: 13, weight: .bold)).foregroundStyle(p.ink)
                .frame(width: 32, height: 32).overlay(Circle().stroke(p.line, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(off)
        .accessibilityLabel(d < 0 ? "Sjekk inn én færre" : "Sjekk inn én til")
    }
}

extension Skjold82 {
    /// «3 deler · 12 stk».
    nonisolated static func partsText(_ x: Skj82Project) -> String {
        let a: String = x.parts == 1 ? "1 del" : "\(x.parts) deler"
        return a + " · " + Skjold76.num(x.units) + " stk"
    }
}
