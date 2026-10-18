import SwiftUI
import UIKit

/* ---------------- Prompt 24: Bursdager – kalendere og Hjem-kortet ---------------- */

/// «KALENDERE»: Google Kalender (logg inn, kalender, skriv nye, kontakter, synk, logg ut) og Home Assistant
/// (velg calendar.*, importer, synk to veier).
struct BirthdayCalendars24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: BirthdayModel24 { BirthdayModel24.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("KALENDERE").font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab).padding(.horizontal, 4).padding(.top, 4)
            VStack(alignment: .leading, spacing: 12) {
                google
                Rectangle().fill(p.line).frame(height: 1)
                ha
            }
            .padding(16)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            Text("Nye bursdager lagres som årlige heldagshendelser. Endringer i Google Kalender og Home Assistant hentes inn automatisk.")
                .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
        }
    }

    private func head<I: View>(_ title: String, _ status: String, _ ok: Bool, @ViewBuilder icon: () -> I) -> some View {
        HStack(spacing: 12) {
            icon()
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                Text(status).font(PF.ui(12.5)).foregroundStyle(ok ? p.pos : p.mut).lineLimit(2)
            }
            Spacer(minLength: 0)
        }
    }

    private var gStatus: String {
        if m.offline { return "Krever oppdatert homelab" }
        if !m.gConnected { return "Ikke koblet til" }
        let who: String = m.gEmail.isEmpty ? "Tilkoblet" : m.gEmail
        if let t = m.gSyncedAt { return who + " · synket " + JS.fmt(t, "HH:mm") }
        return who
    }

    @ViewBuilder private var google: some View {
        head("Google Kalender", gStatus, m.gConnected) {
            GoogleG(size: 20)
                .frame(width: 40, height: 40)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(p.line, lineWidth: 1))
        }
        if !m.gConnected {
            Button { Haptics.shared.tap(); m.googleLogin(store) } label: {
                HStack(spacing: 10) {
                    GoogleG(size: 18)
                    Text(m.busy == "g" ? "Kobler til …" : "Logg inn med Google").font(PF.ui(14.5, .semibold)).foregroundStyle(Color(hex: "#1f1f1f"))
                }
                .frame(maxWidth: .infinity).frame(height: 46)
                .background(Color.white, in: Capsule())
                .overlay(Capsule().stroke(p.line, lineWidth: 1))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(m.busy == "g")
        } else {
            if !m.gCalendars.isEmpty {
                Text("Kalender").font(PF.ui(12.5)).foregroundStyle(p.mut)
                BdChipRow24(options: m.gCalendars.map { ($0.id, $0.name) }, selected: m.gCalendarId, height: 32) { id in
                    m.setGoogle(calendarId: id, store)
                }
            }
            VStack(spacing: 0) {
                BdToggleRow24(title: "Skriv nye bursdager til Google", sub: "Årlig heldagshendelse med påminnelse", on: m.gWriteNew) {
                    m.setGoogle(writeNew: !m.gWriteNew, store)
                }
                BdToggleRow24(title: "Hent bursdager fra Google-kontakter", sub: "Fra kontaktlisten din", on: m.gContacts) {
                    m.setGoogle(contacts: !m.gContacts, store)
                }
            }
            HStack(spacing: 8) {
                Button { Task { await m.googleSync(store) } } label: {
                    Text(m.busy == "gsync" ? "Synker …" : "↻ Synk nå").font(PF.ui(13.5, .bold)).foregroundStyle(p.lab)
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
                }
                .buttonStyle(.plain)
                Button { Task { await m.googleLogout(store) } } label: {
                    Text("Logg ut").font(PF.ui(13.5, .bold)).foregroundStyle(p.ink)
                        .padding(.horizontal, 16).frame(height: 40)
                        .overlay(Capsule().stroke(p.line, lineWidth: 1)).contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var haStatus: String {
        if m.offline { return "Krever oppdatert homelab" }
        if m.haEntity.isEmpty { return "Velg kalender og importer" }
        if let t = m.haSyncedAt { return m.haEntity + " · importert " + JS.fmt(t, "HH:mm") }
        return m.haEntity
    }

    @ViewBuilder private var ha: some View {
        head("Home Assistant", haStatus, m.haSyncedAt != nil) {
            Image(systemName: "house").font(.system(size: 18, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Color(hex: "#18bcf2"), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        if !m.haCalendars.isEmpty {
            Text("Kalender i Home Assistant").font(PF.ui(12.5)).foregroundStyle(p.mut)
            BdChipRow24(options: m.haCalendars.map { ($0.id, $0.id) }, selected: m.haEntity, height: 32) { id in
                m.setHa(entityId: id, store)
            }
        } else if !m.offline {
            Text("Fant ingen calendar.* i Home Assistant ennå.").font(PF.ui(12.5)).foregroundStyle(p.mut)
        }
        if m.haSyncedAt != nil {
            BdToggleRow24(title: "Synk to veier", sub: "Nye bursdager her legges også i Home Assistant", on: m.haTwoWay) {
                m.setHa(twoWay: !m.haTwoWay, store)
            }
        }
        Button { Task { await m.haImport(store) } } label: {
            Text(haButton).font(PF.ui(13.5, .bold)).foregroundStyle(p.bg)
                .frame(maxWidth: .infinity).frame(height: 42)
                .background(p.ink, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(m.busy == "ha")
    }

    private var haButton: String {
        if m.busy == "ha" { return "Importerer …" }
        return m.haSyncedAt != nil ? "↻ Importer på nytt" : "Importer fra Home Assistant"
    }
}

/* ---------- Hjem: «BURSDAGER · NESTE» (h9) ---------- */

/// De tre neste (avatar, navn, «2. nov · fyller 41», «om 15 d» i rødt når det er 7 dager eller mindre) og «alle ›».
struct PaperBirthdaysCard24: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: BirthdayModel24 { BirthdayModel24.shared }

    var body: some View {
        let top: [Birthday24] = Array(m.items.prefix(3))
        Button { store.paperGo("bursdag") } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("BURSDAGER · " + (top.first?.daysLeft == 0 ? "I DAG" : "NESTE")).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.lab)
                    Spacer()
                    Text("alle ›").font(PF.ui(12)).foregroundStyle(p.mut)
                }
                if top.isEmpty {
                    Text(m.loaded ? "Ingen bursdager ennå · Legg til ›" : "Henter …").font(PF.ui(13)).foregroundStyle(p.mut)
                }
                ForEach(top) { b in row(b) }
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
        .task(id: store.account?.id ?? "") { await m.load(store) }
    }

    private func row(_ b: Birthday24) -> some View {
        HStack(spacing: 10) {
            BirthdayAvatar24(b: b, size: 30)
            VStack(alignment: .leading, spacing: 0) {
                Text(b.name).font(PF.ui(14.5, .bold)).foregroundStyle(p.ink).lineLimit(1)
                Text(b.age.map { "\(b.shortDate) · fyller \($0)" } ?? b.shortDate).font(PF.ui(12)).foregroundStyle(p.mut).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text(b.whenText).font(PF.serif(18, medium: true)).foregroundStyle(b.daysLeft <= 7 ? p.lab : p.ink).lineLimit(1).fixedSize()
        }
    }
}
