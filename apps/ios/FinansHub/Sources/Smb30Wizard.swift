import SwiftUI
import UIKit

/* ---------------- Prompt 30: arket «Sett opp nettverksdisk» (Smb30Model.swift) ---------------- */
// Åpnes fra Innstillinger → Backup → Hvor (Backup29Page). Små views med eksplisitte typer (ingen kompilator lokalt).

struct Smb30Sheet: View {
    @Environment(\.paper) private var p

    var body: some View {
        VStack(spacing: 0) {
            Smb30Header()
            ScrollView(.vertical, showsIndicators: false) {
                Smb30Body()
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 24)
            }
            Smb30Footer()
        }
        .background(p.bg)
    }
}

struct Smb30Header: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    private var kicker: String {
        if !m.doneLabel.isEmpty { return "NETTVERKSDISK · FERDIG" }
        return "NETTVERKSDISK · STEG \(m.step + 1) AV 5"
    }
    private var title: String {
        if !m.doneLabel.isEmpty { return "Klar" }
        return Smb30Model.steps[m.step]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(kicker).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut)
                    Text(title).font(PF.serif(28, medium: true)).foregroundStyle(p.ink)
                }
                Spacer(minLength: 8)
                Button { m.close() } label: {
                    Image(systemName: "xmark").font(.system(size: 17, weight: .semibold)).foregroundStyle(p.ink).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Lukk")
            }
            Smb30Progress()
        }
        .padding(.horizontal, 16)
        .padding(.top, 18)
        .padding(.bottom, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
    }
}

struct Smb30Progress: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    private func color(_ i: Int) -> Color {
        if !m.doneLabel.isEmpty || i < m.step { return p.mut }
        if i == m.step { return p.ink }
        return p.line
    }

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<5, id: \.self) { i in
                Rectangle().fill(color(i)).frame(height: 3)
            }
        }
    }
}

struct Smb30Body: View {
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !m.doneLabel.isEmpty {
                Smb30Done()
            } else if m.step == 0 {
                Smb30Find()
            } else if m.step == 1 {
                Smb30Login()
            } else if m.step == 2 {
                Smb30Shares()
            } else if m.step == 3 {
                Smb30Folders()
            } else {
                Smb30Save()
            }
            if let e = m.error { Smb30ErrorBox(err: e) }
        }
    }
}

/* ---------- Steg 1: Finn server ---------- */

struct Smb30Find: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Homelab leter etter NAS-er og PC-er med fildeling (SMB) på hjemmenettet.")
                .font(PF.ui(14.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            HStack {
                Smb30Label(text: "Funnet på nettverket")
                Spacer()
                Smb30Mini(title: m.scanning ? "Søker …" : "↻ Søk igjen", enabled: !m.scanning) { Task { await m.scan(store) } }
            }
            Smb30List { serverRows }
            Smb30Field(title: "Eller skriv IP-adresse eller navn", placeholder: "192.168.1.20 eller nas.local", text: Binding<String>(get: { m.manual }, set: { m.manual = $0 }), keyboard: .URL)
            Smb30Primary(title: m.busy ? "Sjekker …" : "Neste", enabled: !m.busy) { Task { await m.checkManual(force: false, store) } }
            if !m.probeFail.isEmpty {
                Button { Task { await m.checkManual(force: true, store) } } label: {
                    Text("Prøv å logge inn på \(m.probeFail) likevel").font(PF.ui(14, .semibold)).underline().foregroundStyle(p.ink)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private var serverRows: some View {
        if m.scanning && m.servers.isEmpty {
            Smb30Wait(text: "Leter etter servere … (opptil 6 sekunder)")
        } else if m.servers.isEmpty {
            Smb30Empty(text: "Fant ingen servere automatisk. Skriv inn adressen under.")
        } else {
            ForEach(m.servers) { s in
                Smb30Row(title: s.title, sub: s.sub) { m.pick(s) }
            }
        }
    }
}

/* ---------- Steg 2: Logg inn ---------- */

struct Smb30Login: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Smb30Who(title: m.server.title, sub: m.server.sub.isEmpty ? "SMB-server" : m.server.sub)
            Smb30Field(title: "Brukernavn", placeholder: "Brukeren på NAS-en", text: Binding<String>(get: { m.user }, set: { m.user = $0 }))
            Smb30Field(title: "Passord", placeholder: "Passordet på NAS-en", text: Binding<String>(get: { m.password }, set: { m.password = $0 }), secure: true)
            Smb30Field(title: "Domene (valgfritt)", placeholder: "WORKGROUP", text: Binding<String>(get: { m.domain }, set: { m.domain = $0 }))
            Text("Passordet brukes bare mens du setter opp, og lagres kryptert på serveren når du trykker Lagre.")
                .font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Smb30Secondary(title: "Gjest", enabled: !m.busy) { Task { await m.login(guest: true, store) } }
                Smb30Primary(title: m.busy ? "Logger inn …" : "Logg inn", enabled: !m.busy) { Task { await m.login(guest: false, store) } }
            }
        }
    }
}

/* ---------- Steg 3: Velg delt mappe ---------- */

struct Smb30Shares: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    private var lead: String {
        let who: String = m.guest ? " (gjest)" : (m.user.isEmpty ? "" : " som " + m.user)
        return "Delte mapper på " + m.server.title + who + " · " + m.proto
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(lead).font(PF.ui(14.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            Smb30List {
                if m.shares.isEmpty {
                    Smb30Empty(text: "Fant ingen delte mapper brukeren har tilgang til. Lag en på NAS-en, eller logg inn med en annen bruker.")
                } else {
                    ForEach(m.shares) { s in
                        Smb30Row(title: s.name, sub: s.comment) { m.choose(s, store) }
                    }
                }
            }
        }
    }
}

/* ---------- Steg 4: Velg mappe ---------- */

struct Smb30Folders: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Smb30Crumbs()
            HStack(spacing: 8) {
                Smb30Mini(title: "‹ Opp", enabled: !m.path.isEmpty && !m.busy) {
                    let up: [String] = Array(m.path.dropLast())
                    Task { await m.openDir(up, store) }
                }
                Smb30Mini(title: "+ Ny mappe", enabled: !m.busy) { m.showNewDir.toggle() }
            }
            if m.showNewDir { Smb30NewDir() }
            Smb30List { dirRows }
        }
    }

    @ViewBuilder private var dirRows: some View {
        if m.busy && m.dirs == nil {
            Smb30Wait(text: "Henter mapper …")
        } else if (m.dirs ?? []).isEmpty {
            Smb30Empty(text: "Ingen undermapper her. Velg denne mappen, eller lag en ny.")
        } else {
            ForEach(m.dirs ?? [], id: \.self) { d in
                Smb30Row(title: d, sub: "") {
                    let next: [String] = m.path + [d]
                    Task { await m.openDir(next, store) }
                }
            }
        }
    }
}

struct Smb30Crumbs: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    private var items: [String] { [m.share] + m.path }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.offset) { pair in
                    crumb(pair.offset, pair.element)
                }
            }
        }
    }

    @ViewBuilder private func crumb(_ i: Int, _ name: String) -> some View {
        if i > 0 { Text("›").font(PF.ui(14)).foregroundStyle(p.mut) }
        let last: Bool = i == items.count - 1
        Button {
            let to: [String] = Array(m.path.prefix(i))
            Task { await m.openDir(to, store) }
        } label: {
            Text(name).font(PF.ui(14.5, .semibold)).foregroundStyle(last ? p.ink : p.mut).underline(!last)
                .frame(minHeight: 36)
        }
        .buttonStyle(.plain)
        .disabled(last)
    }
}

struct Smb30NewDir: View {
    @Environment(Store.self) private var store
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Smb30Field(title: "Navn på ny mappe", placeholder: "homelab", text: Binding<String>(get: { m.newDir }, set: { m.newDir = $0 }))
            Smb30Primary(title: "Lag mappe", enabled: !m.busy) { Task { await m.makeDir(store) } }
        }
    }
}

/* ---------- Steg 5: Test og lagre ---------- */

struct Smb30Save: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    private var who: String { (m.guest ? "Gjest" : m.user) + " · " + m.proto }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Smb30Who(title: m.label, sub: who, mono: true)
            Smb30TestBox()
            Smb30Label(text: "Bruk nettverksdisken til")
            Smb30List {
                Smb30Check(title: "FinansHub-backup", sub: "Hele databasen, kvitteringer og innstillinger", on: m.useFinans) { m.useFinans.toggle() }
                Smb30Check(title: "Systembackup", sub: "Kopi av hver backup fra Innstillinger → Backup", on: m.useSystem) { m.useSystem.toggle() }
            }
            if m.useSystem && !m.encrypted { Smb30Warn() }
        }
        .task { if m.test == nil && !m.testing { await m.runTest(store) } }
    }
}

struct Smb30TestBox: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        if m.testing || m.test == nil {
            Smb30Wait(text: "Skriver en liten testfil …")
        } else if let t = m.test {
            result(t)
        }
    }

    private func result(_ t: Smb30Test) -> some View {
        let good: Bool = t.ok && t.writable
        let head: String = good ? "✓ Kan skrive" : (t.ok ? "✗ Kan ikke skrive" : "✗ Testen feilet")
        let hints: [String] = good ? [] : Smb30Model.hints(t.ok ? "access" : Smb30Model.kindOf(t.message))
        return VStack(alignment: .leading, spacing: 8) {
            Text(head).font(PF.ui(16, .bold)).foregroundStyle(good ? p.pos : p.lab)
            Text(t.message).font(PF.ui(13.5)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            ForEach(hints, id: \.self) { h in
                Text("• " + h).font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
            Smb30Mini(title: "Test på nytt", enabled: true) { Task { await m.runTest(store) } }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card)
        .overlay(Rectangle().stroke(p.line, lineWidth: 1))
    }
}

struct Smb30Warn: View {
    @Environment(\.paper) private var p

    var body: some View {
        Text("Systembackupen er ikke kryptert. På eget hjemmenett er det greit, men vi anbefaler å slå på «Krypter backup» under Hvor, så filene på NAS-en ikke kan leses av andre.")
            .font(PF.ui(13)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(red: 0.6, green: 0.42, blue: 0.05).opacity(0.10))
            .overlay(alignment: .leading) { Rectangle().fill(Color(red: 0.6, green: 0.42, blue: 0.05)).frame(width: 3) }
    }
}

struct Smb30Done: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark").font(.system(size: 34, weight: .semibold)).foregroundStyle(p.pos)
                .frame(width: 72, height: 72)
                .overlay(Rectangle().stroke(p.pos, lineWidth: 2))
            Text("Koblet til").font(PF.serif(22, medium: true)).foregroundStyle(p.ink)
            Text(m.doneLabel + " ✓").font(PF.mono(14, bold: false)).foregroundStyle(p.pos).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .accessibilityElement(children: .combine)
    }
}

/* ---------- Bunnlinje ---------- */

struct Smb30Footer: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Smb30Model { Smb30Model.shared }

    private var canSave: Bool { !m.busy && (m.test?.writable ?? false) && (m.useFinans || m.useSystem) }

    var body: some View {
        HStack(spacing: 10) {
            if !m.doneLabel.isEmpty {
                Smb30Primary(title: "Ferdig", enabled: true) { m.close() }
            } else {
                Smb30Secondary(title: m.step == 0 ? "Avbryt" : "‹ Tilbake", enabled: true) { m.back(store) }
                if m.step == 3 {
                    Smb30Primary(title: "Velg denne mappen", enabled: !m.busy && m.dirs != nil) { m.go(4) }
                } else if m.step == 4 {
                    Smb30Primary(title: m.busy ? "Lagrer …" : "Lagre", enabled: canSave) { Task { await m.save(store) } }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .overlay(alignment: .top) { Rectangle().fill(p.line).frame(height: 1) }
        .background(p.bg)
    }
}

/* ---------- Byggeklosser ---------- */

struct Smb30Label: View {
    @Environment(\.paper) private var p
    let text: String
    var body: some View { Text(text.uppercased()).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(p.mut) }
}

struct Smb30List<C: View>: View {
    @Environment(\.paper) private var p
    @ViewBuilder let content: () -> C

    var body: some View {
        VStack(spacing: 0) { content() }
            .overlay(alignment: .top) { Rectangle().fill(p.ink).frame(height: 1) }
    }
}

struct Smb30Row: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(PF.ui(16, .semibold)).foregroundStyle(p.ink).multilineTextAlignment(.leading)
                    if !sub.isEmpty { Text(sub).font(PF.ui(13)).foregroundStyle(p.mut).multilineTextAlignment(.leading) }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(p.mut)
            }
            .padding(.horizontal, 4)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
    }
}

struct Smb30Check: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    let on: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            HStack(spacing: 12) {
                Image(systemName: on ? "checkmark.square.fill" : "square").font(.system(size: 22)).foregroundStyle(on ? p.ink : p.mut)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(PF.ui(16, .semibold)).foregroundStyle(p.ink)
                    Text(sub).font(PF.ui(13)).foregroundStyle(p.mut).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 4)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct Smb30Who: View {
    @Environment(\.paper) private var p
    let title: String
    let sub: String
    var mono: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "externaldrive.connected.to.line.below").font(.system(size: 18)).foregroundStyle(p.ink)
                .frame(width: 44, height: 44)
                .overlay(Rectangle().stroke(p.ink, lineWidth: 1))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(mono ? PF.mono(14, bold: false) : PF.ui(16, .semibold)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(sub).font(PF.ui(13)).foregroundStyle(p.mut)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { Rectangle().fill(p.ink).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
    }
}

struct Smb30Field: View {
    @Environment(\.paper) private var p
    let title: String
    let placeholder: String
    let text: Binding<String>
    var secure: Bool = false
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(PF.ui(13, .semibold)).foregroundStyle(p.mut)
            input
                .font(PF.ui(16))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .keyboardType(keyboard)
                .padding(.horizontal, 14)
                .frame(height: 50)
                .background(p.card)
                .overlay(Rectangle().stroke(p.line, lineWidth: 1))
                .overlay(alignment: .bottom) { Rectangle().fill(p.ink).frame(height: 1) }
        }
    }

    @ViewBuilder private var input: some View {
        if secure {
            SecureField(placeholder, text: text).textContentType(.password)
        } else {
            TextField(placeholder, text: text)
        }
    }
}

struct Smb30Primary: View {
    @Environment(\.paper) private var p
    let title: String
    let enabled: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(15.5, .semibold)).foregroundStyle(p.bg)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(p.ink)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }
}

struct Smb30Secondary: View {
    @Environment(\.paper) private var p
    let title: String
    let enabled: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(15.5, .semibold)).foregroundStyle(p.ink)
                .frame(maxWidth: .infinity, minHeight: 50)
                .overlay(Rectangle().stroke(p.ink, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }
}

struct Smb30Mini: View {
    @Environment(\.paper) private var p
    let title: String
    let enabled: Bool
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Text(title).font(PF.ui(14, .semibold)).foregroundStyle(p.ink)
                .padding(.horizontal, 14)
                .frame(minHeight: 40)
                .background(p.card)
                .overlay(Rectangle().stroke(p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.45)
    }
}

struct Smb30Wait: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        HStack(spacing: 12) {
            ProgressView()
            Text(text).font(PF.ui(14.5)).foregroundStyle(p.mut)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 18)
        .padding(.horizontal, 4)
        .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
    }
}

struct Smb30Empty: View {
    @Environment(\.paper) private var p
    let text: String

    var body: some View {
        Text(text).font(PF.ui(14.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 18)
            .padding(.horizontal, 4)
            .overlay(alignment: .bottom) { Rectangle().fill(p.line).frame(height: 1) }
    }
}

struct Smb30ErrorBox: View {
    @Environment(\.paper) private var p
    let err: Smb30Error

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(err.message).font(PF.ui(14, .semibold)).foregroundStyle(p.lab).fixedSize(horizontal: false, vertical: true)
            ForEach(err.hints, id: \.self) { h in
                Text("• " + h).font(PF.ui(13)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.lab.opacity(0.07))
        .overlay(alignment: .leading) { Rectangle().fill(p.lab).frame(width: 3) }
        .accessibilityElement(children: .combine)
    }
}
