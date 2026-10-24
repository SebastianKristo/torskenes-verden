import SwiftUI
import UserNotifications
import AVFoundation
import HealthKit

/* ---------------- Papir: innlogging, totrinn og onboarding ---------------- */

/// Fotoheader med kicker og stor tittel (innlogging og onboarding).
private struct GateHeader: View {
    let kicker: String
    let title: String
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            gradient
            if let img = Store.cachedBg("oslo") {
                Color.clear.overlay { Image(uiImage: img).resizable().scaledToFill() }.clipped()
            }
            LinearGradient(stops: [.init(color: .black.opacity(0.25), location: 0), .init(color: .clear, location: 0.35), .init(color: .black.opacity(0.45), location: 1)],
                           startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 4) {
                Text(kicker).font(PF.italic(17)).opacity(0.9)
                Text(title).font(PF.serif(42, medium: true)).lineLimit(3).fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.4), radius: 7)
            .padding(.horizontal, 26).padding(.bottom, 30)
        }
        .frame(height: 300)
        .clipped()
    }

    private var gradient: some View {
        LinearGradient(colors: [Color(hex: "#5d7690"), Color(hex: "#2a3440"), Color(hex: "#1d242c")], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// Understreket felt: etikett i mono-aksent og verdien i Newsreader.
private struct GateField<F: View>: View {
    @Environment(\.paper) private var p
    let label: String
    @ViewBuilder let field: () -> F
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: label)
            field().font(PF.serif(19)).foregroundStyle(p.ink).frame(height: 34)
            Rectangle().fill(p.ink.opacity(0.35)).frame(height: 1)
        }
    }
}

/// Innlogging i Papir: Server, Brukernavn og Passord, så sekssifret kode når kontoen har totrinn.
struct PaperLoginView: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    @State private var server = ""
    @State private var username = ""
    @State private var password = ""
    @State private var code = ""
    @State private var trust = true

    var body: some View {
        let p = PaperPalette.of(store.paperMode, system: paperSystemScheme(phase))
        ScrollView {
            VStack(spacing: 0) {
                GateHeader(kicker: store.pending != nil ? "\(AppMeta.shared.name) · \(host)" : "\(AppMeta.shared.name) · \(host.isEmpty ? "logg inn" : host)",
                           title: Sec51Model.shared.wait != nil ? "Ny\nenhet" : store.pending != nil ? "Totrinns-\nbekreftelse" : store.addingAccount ? "Legg til\nkonto" : "Hei,\nvelkommen hjem")
                VStack(alignment: .leading, spacing: 18) {
                    // Prompt 51 (SEC51): «Venter på godkjenning» når innloggingen fra en ny enhet må godkjennes (FHSec51.swift).
                    if Sec51Model.shared.wait != nil { Sec51WaitView() } else if let pd = store.pending { twoFactor(pd, p) } else { form(p) }
                }
                .padding(.horizontal, 26).padding(.top, 26).padding(.bottom, 40)
                .frame(maxWidth: 520)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .ignoresSafeArea(edges: .top)
        .background(p.bg.ignoresSafeArea())
        .environment(\.paper, p)
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear { if !store.addingAccount { server = store.server } }
        .server41Host(p)
        .qr46Host(p, store)
    }

    private var host: String {
        let s = store.pending?.server ?? server
        return s.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }

    @ViewBuilder private func form(_ p: PaperPalette) -> some View {
        // Prompt 41: ingen SERVER-felt. Adressen er kjent (standard, sist brukt eller lært fra serveren), Server41.swift.
        GateField(label: "Brukernavn") {
            TextField("Brukernavn", text: $username).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        GateField(label: "Passord") {
            SecureField("Passord", text: $password).textContentType(.password).submitLabel(.go).onSubmit(submit)
        }
        if Server41.shared.unreachable {
            Server41LoginError(retry: submit)
        }
        PInkButton(title: store.busy || Server41.shared.probing ? "Logger inn …" : "Logg inn", height: 54, full: true, act: submit)
            .disabled(username.isEmpty || password.isEmpty || store.busy || Server41.shared.probing)
            .opacity(username.isEmpty || password.isEmpty ? 0.5 : 1)
        if store.addingAccount {
            PLineButton(title: "Avbryt", height: 48, full: true) { store.addingAccount = false }
            // Prompt 41: en annen server kan velges her (ellers brukes standard/kjente adresser).
            Button { Server41.shared.editKind = "login" } label: {
                Text(Server41.shared.manual.isEmpty ? "Annen server …" : "Server: " + Server41.shared.manual.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: ""))
                    .font(PF.ui(13, .semibold)).foregroundStyle(p.mut).underline()
            }
            .buttonStyle(.plain)
        }
        // Prompt 46: QR-innlogging – en innlogget mobil skanner koden og godkjenner med Face ID (Qr46Login.swift).
        Qr46LoginButton()
        Text("Nye brukere opprettes av admin i Homelab → Innstillinger → Innlogging.").font(PF.ui(12.5)).foregroundStyle(p.mut)
    }

    @ViewBuilder private func twoFactor(_ pd: PendingLogin, _ p: PaperPalette) -> some View {
        Text("Skriv inn den sekssifrede koden fra autentiseringsappen for \(pd.username.isEmpty ? "kontoen" : pd.username).").font(PF.ui(14)).foregroundStyle(p.mut)
        GateField(label: "Kode") {
            TextField("000000", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                .font(PF.mono(24, bold: false))
                .onChange(of: code) { _, v in
                    let d = String(v.filter(\.isNumber).prefix(6))
                    if d != v { code = d }
                }
        }
        Button { trust.toggle() } label: {
            HStack(spacing: 10) {
                Image(systemName: trust ? "checkmark.square.fill" : "square").foregroundStyle(trust ? p.ink : p.mut)
                Text("Husk denne enheten i 30 dager").font(PF.ui(14)).foregroundStyle(p.ink)
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        PInkButton(title: store.busy ? "Bekrefter …" : "Bekreft", height: 54, full: true) {
            store.login(server: pd.server, username: pd.username, password: pd.password, code: code, trust: trust)
        }
        .disabled(code.count < 6 || store.busy)
        .opacity(code.count < 6 ? 0.5 : 1)
        PLineButton(title: "← Tilbake", height: 44) { store.cancelTotp(); code = "" }
        Text("Har du mistet telefonen, kan du bruke en gjenopprettingskode.").font(PF.ui(12.5)).foregroundStyle(p.mut)
    }

    private func submit() { store.login41(username: username, password: password) }
}

/// Første gang etter innlogging: 1) design, 2) bakgrunn på Hjem, 3) varsler og tilgang. Alt kan endres senere.
struct PaperOnboardingView: View {
    @Environment(Store.self) private var store
    @Environment(\.scenePhase) private var phase
    @State private var design = "lys"
    @State private var push = true
    @State private var cam = true
    @State private var bio = true
    @State private var hap = true
    /// Prompt 20: posisjon for Familie og Apple Health.
    @State private var loc = true
    @State private var health = true

    var body: some View {
        let step = store.onboarding ?? 0
        let p = palette
        ScrollView {
            VStack(spacing: 0) {
                GateHeader(kicker: "Steg \(step + 1) av 3", title: titles[Swift.min(2, step)])
                VStack(alignment: .leading, spacing: 14) {
                    dots(step, p)
                    // Prompt 37: først «Hvem er du?» – koble brukeren til en profil i husstanden (Profile37.swift).
                    if step == 0 && Profile37Model.shared.needsLink {
                        Profile37LinkView()
                    } else {
                        switch step {
                        case 0: themes(p)
                        case 1: backgrounds(p)
                        default: perms(p)
                        }
                        HStack(spacing: 10) {
                            if step > 0 { PLineButton(title: "Tilbake", height: 50, full: true) { store.onboarding = step - 1 } }
                            PInkButton(title: step < 2 ? "Neste" : "Ferdig", height: 50, full: true) { next(step) }
                        }
                        .padding(.top, 6)
                        Button("Hopp over") { finish(skip: true) }.font(PF.ui(13, .semibold)).foregroundStyle(p.mut).frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 22).padding(.top, 20).padding(.bottom, 40)
            }
        }
        .ignoresSafeArea(edges: .top)
        .background(p.bg.ignoresSafeArea())
        .environment(\.paper, p)
        .environment(\.colorScheme, p.dark ? .dark : .light)
        .onAppear { design = store.paperMode == "mork" ? "mork" : "lys" }
        .task { await Profile37Model.shared.load(store) }
    }

    private var palette: PaperPalette { design == "mork" ? .night : .light }

    private var titles: [String] {
        let first = store.displayName.split(separator: " ").first.map(String.init) ?? ""
        return ["Velkommen,\n\(first.isEmpty ? "hei" : first)", "Velg bakgrunn", "Nesten ferdig"]
    }

    private func dots(_ step: Int, _ p: PaperPalette) -> some View {
        HStack(spacing: 6) {
            ForEach(0..<3, id: \.self) { i in Capsule().fill(i <= step ? p.ink : p.line).frame(width: 28, height: 4) }
        }
    }

    @ViewBuilder private func themes(_ p: PaperPalette) -> some View {
        PLabel(text: "Velg design")
        optionRow("Papir · lys", "Lyst papir, avisspalter og svart fanelinje.", [Color(hex: "#5d7690"), Color(hex: "#f3efe6")], design == "lys", p) { design = "lys" }
        optionRow("Papir · mørk", "Kveldspapir med lys fanelinje.", [Color(hex: "#2a3440"), Color(hex: "#14130f")], design == "mork", p) { design = "mork" }
    }

    @ViewBuilder private func backgrounds(_ p: PaperPalette) -> some View {
        PLabel(text: "Bakgrunn på Hjem")
        let list: [(String, String, String)] = [("cur", "Nåværende", "Mørk gradient"), ("oslo", "Oslo", "Bilde av Oslo"), ("weather", "Vær nå", "Følger været"), ("planets", "Planeter", "Ny planet hver dag (NASA)")]
        ForEach(list, id: \.0) { k in
            optionRow(k.1, k.2, [Color(hex: "#4a5a6a"), Color(hex: "#1d242c")], store.photo == k.0, p) { store.setPhoto(k.0) }
        }
    }

    @ViewBuilder private func perms(_ p: PaperPalette) -> some View {
        PLabel(text: "Varsler og tilgang")
        VStack(spacing: 0) {
            toggle("Varsler", "Pakker, frister og kvitteringer", $push, p)
            Rectangle().fill(p.line).frame(height: 1)
            toggle("Kamera", "For å skanne kvitteringer og oppskrifter", $cam, p)
            Rectangle().fill(p.line).frame(height: 1)
            toggle("Face ID / fingeravtrykk", "Lås opp uten passord", $bio, p)
            Rectangle().fill(p.line).frame(height: 1)
            toggle("Haptisk tilbakemelding", "Små vibrasjoner ved trykk", $hap, p)
            Rectangle().fill(p.line).frame(height: 1)
            toggle("Posisjon", "Del hvor du er med familien i Familie", $loc, p)
            if HKHealthStore.isHealthDataAvailable() {
                Rectangle().fill(p.line).frame(height: 1)
                toggle("Apple Health", "Skritt, puls, søvn og aktivitet i Familie", $health, p)
            }
        }
        .background(p.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        Text("Alt kan endres senere under Innstillinger. «Logg ut» ligger under Innstillinger → Konto.").font(PF.ui(12.5)).foregroundStyle(p.mut)
    }

    private func optionRow(_ n: String, _ s: String, _ sw: [Color], _ on: Bool, _ p: PaperPalette, _ act: @escaping () -> Void) -> some View {
        Button { Haptics.shared.select(); act() } label: {
            HStack(spacing: 12) {
                LinearGradient(colors: sw, startPoint: .top, endPoint: .bottom)
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(n).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text(s).font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer()
                if on { Text("✓").font(PF.ui(15, .bold)).foregroundStyle(p.ink) }
            }
            .padding(12)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? p.ink : Color.clear, lineWidth: 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func toggle(_ n: String, _ s: String, _ b: Binding<Bool>, _ p: PaperPalette) -> some View {
        Toggle(isOn: b) {
            VStack(alignment: .leading, spacing: 2) {
                Text(n).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(s).font(PF.ui(12.5)).foregroundStyle(p.mut)
            }
        }
        .tint(p.pos)
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private func next(_ step: Int) {
        Haptics.shared.tap()
        if step < 2 { store.onboarding = step + 1 } else { finish() }
    }

    /// Lagrer valgene: design, haptikk, lås og tillatelser (systemets egne spørsmål).
    private func finish(skip: Bool = false) {
        Haptics.shared.on = hap
        if !skip { finishFamily() }
        if bio { store.lockEnabled = true }
        if push { UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in } }
        if cam { AVCaptureDevice.requestAccess(for: .video) { _ in } }
        store.setPaperMode(design)
        store.finishOnboarding()
    }

    /// «Ferdig»: posisjonsdeling (iOS spør om posisjon) og Apple Health (iOS-dialogen med alle typene).
    private func finishFamily() {
        if loc && FamilyModel.shared.sharing != "on" { FamilyModel.shared.setSharing("on", store) }
        if health && HKHealthStore.isHealthDataAvailable() { HealthSync.shared.enableFromOnboarding(store) }
    }
}
