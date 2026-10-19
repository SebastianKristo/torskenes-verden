import SwiftUI

/* ---------------- Prompt 37: «Hvor er Ingrid?» i søket på Hjem ---------------- */
// prompts/prompt-37-pakke/claude-code-sok-hvor-er.md. Serveren (SERVER37) tolker spørsmålet og svarer fra /api/assist med
// {intent:'family.where', text, person, place, open:{route:'familie', person}} – bare om personer som deler posisjon med deg.
// Appen viser teksten i svarboblen, «Familie · posisjon» som kilde og «Vis på kart ›», som åpner Familie med personen valgt.

enum Assist37 {
    /// Leser person/open fra svaret (begge former: streng eller {id, name}).
    static func take(_ a: inout Assist31Answer, _ o: [String: Any], _ raw: [String: Any]) {
        let op: [String: Any]? = JS.dict(o, "open") ?? JS.dict(raw, "open")
        let route: String = (JS.str(op, "route") ?? "").lowercased()
        let isWhere: Bool = a.intent == "family.where" || route == "familie" || route == "family"
        guard isWhere else { return }
        var pid: String = ""
        var pname: String = ""
        if let pd = JS.dict(op, "person") ?? JS.dict(o, "person") {
            pid = JS.str(pd, "id") ?? JS.str(pd, "userId") ?? JS.str(pd, "username") ?? ""
            pname = JS.str(pd, "name") ?? ""
        } else {
            pid = JS.str(op, "person") ?? JS.str(o, "person") ?? ""
        }
        if pname.isEmpty { pname = pid }
        a.fam37Person = pid.isEmpty ? "-" : pid
        a.fam37Name = pname
        if a.source.isEmpty { a.source = "Familie · posisjon" }
    }

    /// Åpner Familie med personen valgt (laster Familie først hvis den ikke er lastet).
    @MainActor
    static func openFamily(_ a: Assist31Answer, _ store: Store) {
        Haptics.shared.tap()
        store.paperGo("familie")
        let fm: FamilyModel = FamilyModel.shared
        if pick(a, fm) { return }
        Task { @MainActor in
            await fm.load(store)
            _ = pick(a, fm)
        }
    }

    @MainActor
    private static func pick(_ a: Assist31Answer, _ fm: FamilyModel) -> Bool {
        let want: String = a.fam37Person.lowercased()
        let wantName: String = a.fam37Name.lowercased()
        if want == "-" && wantName.isEmpty { return true }
        let hit: FamMember? = fm.members.first { (m: FamMember) -> Bool in
            m.id.lowercased() == want || m.username.lowercased() == want || m.name.lowercased() == wantName
                || m.name.lowercased().hasPrefix(wantName + " ")
        }
        guard let hit else { return false }
        fm.selected = hit.id
        return true
    }
}

/// Bunnlinjen i svarboblen: «✦ Familie · posisjon» og «Vis på kart ›».
struct Assist37FamFoot: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Assist31 { Assist31.shared }
    let a: Assist31Answer

    var body: some View {
        HStack(spacing: 8) {
            Text("✦ " + (a.source.isEmpty ? "Familie · posisjon" : a.source))
                .font(PF.ui(11.5, .semibold)).foregroundStyle(Color(hex: "#f6f2ea").opacity(0.55)).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                m.closeHome()
                Assist37.openFamily(a, store)
            } label: {
                Text("Vis på kart ›").font(PF.ui(12.5, .bold)).foregroundStyle(Color.white).lineLimit(1).fixedSize()
                    .padding(.horizontal, 14).frame(height: 32)
                    .background(Color.white.opacity(0.14), in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Vis på kart i Familie")
        }
    }
}
