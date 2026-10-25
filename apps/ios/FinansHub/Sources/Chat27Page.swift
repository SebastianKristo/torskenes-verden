import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers

/* ---------------- Prompt 27: Chat-siden (fullskjerm) ---------------- */
// Fasit: side «chat» i design/Mobil Papir App.dc.html. Telefon: historikk i skuff (☰). Fold/iPad (bred, ≥ 600 pt):
// fast sidepanel på 288 pt. Toppen: ‹ ☰, modellvelger (LOKAL grønn / SKY rød), ⚙ og ny chat.
// Skrivefeltet: vedlegg (+), Nettsøk og Mine data som brikker, mikrofon med lydbølge, Send / Stopp.

struct Chat27Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.paperWide) private var wide
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    @State private var photo: PhotosPickerItem? = nil
    @State private var photos28: [PhotosPickerItem] = []
    @State private var photoOpen: Bool = false
    @State private var cameraOpen: Bool = false
    @State private var fileOpen: Bool = false
    @State private var fileToKb: Bool = false

    var body: some View {
        let c: ChatPal27 = ChatPal27.make(p, theme: s.theme)
        HStack(spacing: 0) {
            if wide {
                Chat27History(c: c, showClose: false)
                    .frame(width: 288)
                    .background(c.side.ignoresSafeArea())
                    .overlay(alignment: .trailing) { Rectangle().fill(c.line).frame(width: 1).ignoresSafeArea() }
            }
            Chat27Main(c: c)
        }
        .background(c.bg.ignoresSafeArea())
        // Prompt 32: hele Chat-flaten ignorerer tastaturet; skriveboksen løftes av Kb32bLift (Chat32Keyboard.swift).
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .overlay {
            if !wide && s.drawer { drawer(c) }
        }
        .animation(.easeOut(duration: 0.22), value: s.drawer)
        .environment(\.colorScheme, c.dark ? .dark : .light)
        .task(id: "\(store.account?.id ?? "")|\(s.promptTick)") { await s.boot(store) }
        .onDisappear {
            ChatVoice27.shared.stop()
            ChatVoice27.shared.stopSpeaking()
        }
        .sheet(item: Binding<Chat27SheetId?>(get: { s.sheet.map { Chat27SheetId(id: $0) } }, set: { s.sheet = $0?.id })) { sh in
            Chat27Sheet(kind: sh.id, c: c, pickPhoto: { pick(photo: true) }, pickCamera: { pick(camera: true) },
                        pickFile: { kb in pick(file: true, kb: kb) })
                .presentationDetents(detents(sh.id))
                // Prompt 52: sveip i arket scroller innholdet (ikke arkets høyde); grabberen/toppen drar arket ned.
                .presentationContentInteraction(.scrolls)
                .presentationDragIndicator(sh.id == "plus" || sh.id == "model" ? .visible : .automatic)
                .presentationBackground(c.bg)
                .environment(\.colorScheme, c.dark ? .dark : .light)
        }
        .sheet(item: Binding<ChatShare27?>(get: { s.share }, set: { s.share = $0 })) { it in
            ShareSheet(url: it.url).presentationDetents([.medium, .large])
        }
        // Prompt 28: «Bilder» velger flere bilder fra biblioteket.
        .photosPicker(isPresented: $photoOpen, selection: $photos28, maxSelectionCount: 6, matching: .images)
        .onChange(of: photos28) { _, list in loadMany(list) }
        .fullScreenCover(isPresented: $cameraOpen) {
            CameraView { img in if let img { s.addImage(img) } }.ignoresSafeArea()
        }
        .fileImporter(isPresented: $fileOpen, allowedContentTypes: [.pdf, .plainText, .commaSeparatedText, .data], allowsMultipleSelection: false) { r in
            if case .success(let urls) = r, let u = urls.first { s.addFile(u, store, toKnowledge: fileToKb) }
        }
        // Prompt 50: lysboks for bildene i chatten (Chat50Attach.swift).
        .chat50Host()
    }

    private func detents(_ id: String) -> Set<PresentationDetent> {
        // Prompt 28: «Legg ved» får høyden etter innholdet (Chat28.swift måler den).
        if id == "plus" { return [.height(Chat28.shared.plusHeight)] }
        if id == "guard" { return [.medium] }
        // Prompt 52 (claude-code-chat-velg-modell-scroll.md): modellvelgeren åpnes stor, med én scrollflate.
        if id == "model" { return [.large] }
        return [.medium, .large]
    }

    private func drawer(_ c: ChatPal27) -> some View {
        ZStack(alignment: .leading) {
            Color.black.opacity(0.4).ignoresSafeArea()
                .onTapGesture { s.drawer = false }
            Chat27History(c: c, showClose: true)
                .frame(width: 300)
                .frame(maxHeight: .infinity)
                .background(c.side.ignoresSafeArea())
                .transition(.move(edge: .leading))
        }
        .transition(.opacity)
    }

    /// Arket lukkes før velgeren åpnes (to ark samtidig gir feil i SwiftUI).
    private func pick(photo: Bool = false, camera: Bool = false, file: Bool = false, kb: Bool = false) {
        s.sheet = nil
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            if photo { photoOpen = true }
            if camera { cameraOpen = true }
            if file { fileToKb = kb; fileOpen = true }
        }
    }

    private func loadMany(_ list: [PhotosPickerItem]) {
        if list.isEmpty { return }
        Task { @MainActor in
            for it in list {
                if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { s.addImage(img) }
            }
            photos28 = []
        }
    }

    private func load(_ it: PhotosPickerItem?) {
        guard let it else { return }
        Task { @MainActor in
            if let d = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: d) { s.addImage(img) }
            photo = nil
        }
    }
}

struct Chat27SheetId: Identifiable {
    let id: String
}

/* ---------- Hovedfeltet ---------- */

struct Chat27Main: View {
    @Environment(\.paperWide) private var wide
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        // Prompt 32: skriveboksen løftes selv med den målte tastatur-overlappen (Chat32Keyboard.swift). Flaten ignorerer
        // tastatur-regionen, så foreldrene (PaperShell sin GeometryReader m.fl.) ikke kan spise eller doble løftet.
        VStack(spacing: 0) {
            Chat27TopBar(c: c)
            Chat27Messages(c: c)
                .frame(maxHeight: .infinity)
            Chat27Composer(c: c)
        }
        // Prompt 50: dra og slipp filer inn i chatten (iPad/Fold), med laget «Slipp for å legge ved».
        .chat50Drop(c)
        .keyboardLift32b()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}

struct Chat27TopBar: View {
    @Environment(Store.self) private var store
    @Environment(\.paperWide) private var wide
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        let m: ChatLLM27 = s.current
        HStack(spacing: 4) {
            if !wide {
                iconButton("chevron.left", "Tilbake") { Nav27.back(store) }
                iconButton("line.3.horizontal", "Historikk") {
                    s.drawer = true
                    Haptics.shared.select()
                }
            } else {
                iconButton("chevron.left", "Tilbake") { Nav27.back(store) }
            }
            Button { s.sheet = "model" } label: {
                HStack(spacing: 8) {
                    Text(s.model.isEmpty ? "Velg modell" : m.label).font(c.ui(15, .bold)).foregroundStyle(c.ink).lineLimit(1)
                    Chat27Badge(sky: m.sky, auto: m.kind == "auto")
                    Text("▼").font(c.ui(11)).foregroundStyle(c.mut)
                }
                .padding(.horizontal, 12).frame(height: 40)
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Velg modell, " + m.label)
            Spacer(minLength: 4)
            iconButton("gearshape", "Samtaleinnstillinger") { s.sheet = "params" }
            if !wide { iconButton("square.and.pencil", "Ny chat") { s.newChat() } }
        }
        .padding(.horizontal, 10).padding(.top, 4).padding(.bottom, 6)
    }

    private func iconButton(_ icon: String, _ label: String, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Image(systemName: icon).font(.dyn51(size: 18, weight: .semibold)).foregroundStyle(c.ink)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// LOKAL (grønn) eller SKY (rød).
struct Chat27Badge: View {
    let sky: Bool
    /// Prompt 41: «✦ Auto» får lilla AUTO-merke.
    var auto: Bool = false

    var body: some View {
        Text(auto ? "AUTO" : (sky ? "SKY" : "LOKAL")).font(PF.mono(9.5)).tracking(0.8).foregroundStyle(Color.white)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(Color(hex: auto ? "#7a5ad6" : (sky ? "#b23a2a" : "#2f7a4f")), in: Capsule())
    }
}

/* ---------- Meldingene ---------- */

struct Chat27Messages: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    if !s.notice.isEmpty && s.msgs.isEmpty {
                        Text(s.notice).font(c.ui(13, .semibold)).foregroundStyle(c.mut)
                    }
                    if s.empty {
                        Chat27Empty(c: c)
                    }
                    ForEach(Array(s.msgs.enumerated()), id: \.element.id) { i, m in
                        if m.role == "user" {
                            Chat27UserBubble(m: m, index: i, c: c)
                        } else {
                            Chat27Answer(m: m, index: i, c: c)
                        }
                    }
                    if s.busy { Chat27Streaming(c: c) }
                    Color.clear.frame(height: 1).id("c27bottom")
                }
                .frame(maxWidth: 760, alignment: .leading)
                .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 24)
                .frame(maxWidth: .infinity, minHeight: 200, alignment: .top)
                // Prompt 28: trykk i meldingsområdet (ikke på knapper) skjuler tastaturet.
                .contentShape(Rectangle())
                .onTapGesture { Chat28.hideKeyboard() }
            }
            .background(Color.clear.contentShape(Rectangle()).onTapGesture { Chat28.hideKeyboard() })
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: s.scrollTick) { _, _ in
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("c27bottom", anchor: .bottom) }
            }
            .onChange(of: s.streamText.count / 80) { _, _ in proxy.scrollTo("c27bottom", anchor: .bottom) }
            // Prompt 30/32: tastaturet opp → siste melding rett over skriveboksen (også etter QuickType/rotasjon).
            .onChange(of: Kb32b.shared.settleTick) { (_: Int, _: Int) in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("c27bottom", anchor: .bottom) }
            }
        }
    }
}

/// Tom samtale: modellen, «Hva kan jeg hjelpe med?», personaer og forslag.
struct Chat27Empty: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    let c: ChatPal27

    var body: some View {
        let m: ChatLLM27 = s.current
        let line: String = m.sky ? (m.name + " · " + m.provider) : (m.id + " · lokalt på hjemmeserveren")
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text(line.uppercased()).font(c.mono(10.5)).tracking(1.2).foregroundStyle(c.acc).lineLimit(2)
                Text("Hva kan jeg hjelpe med?").font(c.head(34)).foregroundStyle(c.ink).fixedSize(horizontal: false, vertical: true)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(ChatStore27.personas, id: \.0) { per in
                        let on: Bool = s.params.persona == per.0
                        Button { s.setParams(store) { $0.persona = per.0 } } label: {
                            Text(per.1).font(c.ui(13.5, .bold)).foregroundStyle(on ? c.bg : c.ink)
                                .padding(.horizontal, 14).frame(height: 36)
                                .background(on ? c.ink : c.card, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            VStack(spacing: 8) {
                ForEach(ChatStore27.suggestions, id: \.0) { g in
                    Button { s.send(g.0, store, data: g.2) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(g.0).font(c.ui(15, .semibold)).foregroundStyle(c.ink).multilineTextAlignment(.leading)
                            if !g.1.isEmpty { Text(g.1).font(c.ui(12)).foregroundStyle(c.mut) }
                        }
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(c.line, lineWidth: 1))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 20)
    }
}

/* ---------- Skrivefeltet ---------- */

struct Chat27Composer: View {
    @Environment(Store.self) private var store
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    @MainActor private var voice: ChatVoice27 { ChatVoice27.shared }
    @FocusState private var focus: Bool
    let c: ChatPal27

    var body: some View {
        let sky: Bool = s.current.sky
        VStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 6) {
                // Prompt 50: miniatyrrad (64×64, ×, fremdrift) og «Lim inn bilde» (Chat50Attach.swift).
                if !s.attach.isEmpty { Chat50AttachRow(c: c) }
                if voice.recording {
                    HStack(spacing: 10) {
                        Circle().fill(Color(hex: "#b23a2a")).frame(width: 8, height: 8)
                        Text("Lytter … snakk nå").font(c.ui(15)).foregroundStyle(c.ink)
                        Spacer(minLength: 4)
                        ChatWave27(color: Color(hex: "#b23a2a"))
                    }
                    .padding(.horizontal, 8).frame(minHeight: 40)
                } else {
                    TextField("", text: Binding<String>(get: { s.input }, set: { s.input = $0 }),
                              prompt: Text("Spør " + s.current.label + " …").foregroundColor(c.mut), axis: .vertical)
                        .lineLimit(1...6)
                        .font(c.ui(16)).foregroundStyle(c.ink)
                        .focused($focus)
                        .submitLabel(.send)
                        .padding(.horizontal, 8).padding(.vertical, 8)
                }
                HStack(spacing: 4) {
                    round("plus", "Legg ved", on: false) { s.sheet = "plus" }
                    chip("globe", "Nettsøk", on: s.webOn) { s.webOn.toggle(); Haptics.shared.select() }
                    chip("lock", "Mine data", on: s.dataOn && s.myDataAllowed) { s.toggleData() }
                    Spacer(minLength: 2)
                    round("mic", "Snakk", on: voice.recording) { mic() }
                    if s.busy {
                        Button { s.stop() } label: {
                            RoundedRectangle(cornerRadius: 3).fill(c.bg).frame(width: 12, height: 12)
                                .frame(width: 38, height: 38)
                                .background(c.ink, in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Stopp")
                    } else {
                        // Prompt 43: tom melding = lys knapp med synlig pil og tynn kant (ikke 35 % opasitet); med tekst mørk som før.
                        Button { send() } label: {
                            Image(systemName: "arrow.up").font(.dyn51(size: 17, weight: .bold)).foregroundStyle(canSend ? c.bg : c.mut)
                                .frame(width: 38, height: 38)
                                .background {
                                    if canSend {
                                        Circle().fill(c.ink)
                                    } else {
                                        // line blandet med card (70/30).
                                        ZStack { Circle().fill(c.card); Circle().fill(c.line.opacity(0.7)) }
                                    }
                                }
                                .overlay { if !canSend { Circle().strokeBorder(c.line, lineWidth: 1.5) } }
                                .contentShape(Circle())
                                .animation(.easeOut(duration: 0.15), value: canSend)
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSend)
                        .accessibilityLabel("Send")
                        .accessibilityHint(canSend ? "" : "Skriv en melding først")
                    }
                }
                // Prompt 43: 4 pt luft til høyre og 2 pt under, så knappen og kanten står helt inne i kortet.
                .padding(.trailing, 4).padding(.bottom, 2)
            }
            .padding(8)
            .background(c.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(c.line, lineWidth: 1))
            .shadow(color: .black.opacity(0.18), radius: 14, y: 8)
            .frame(maxWidth: 760)
            // Prompt 28: ingen tekst for lokale modeller; bare én linje for sky-modeller.
            if sky {
                Text("Sky-modell: meldingen sendes til " + (s.current.provider == "groq" ? "Groq" : "Google") + ".")
                    .font(c.ui(11.5)).foregroundStyle(c.mut).multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 12).padding(.top, 4).padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .top) {
            if !s.toast.isEmpty {
                Text(s.toast).font(c.ui(13, .semibold)).foregroundStyle(c.bg)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(c.ink, in: Capsule())
                    .offset(y: -46)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.18), value: s.toast)
        // Prompt 50: «Lim inn bilde» flyter over feltet når utklippstavlen har et bilde (tar ikke plass i layouten).
        .overlay(alignment: .topLeading) {
            if s.toast.isEmpty { Chat50PasteChip(c: c).padding(.leading, 16).offset(y: -40) }
        }
    }

    private var canSend: Bool {
        if s.attach.contains(where: { $0.uploading }) { return false }
        return !s.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !s.attach.isEmpty
    }

    private func send() {
        if voice.recording { voice.stop() }
        s.send(s.input, store)
    }

    private func mic() {
        voice.toggle(onText: { (t: String) in ChatStore27.shared.input = t },
                     onError: { (e: String) in ChatStore27.shared.flash(e) })
    }

    private var attachments: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(s.attach) { a in
                    HStack(spacing: 6) {
                        // Prompt 52: bildevedlegg får en 24 × 24 miniatyr i stedet for ▣ (Chat52Think.swift).
                        Chat52AttachIcon(a: a, c: c)
                        Text(a.name).font(c.ui(12.5, .semibold)).foregroundStyle(c.ink).lineLimit(1)
                        Button { s.removeAttach(a) } label: {
                            Text("✕").font(c.ui(11)).foregroundStyle(c.mut).frame(width: 26, height: 26)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Fjern vedlegg")
                    }
                    .padding(.leading, 10).frame(height: 32)
                    .background(c.bg, in: Capsule())
                }
            }
        }
    }

    private func round(_ icon: String, _ label: String, on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Image(systemName: icon).font(.dyn51(size: 17, weight: .semibold)).foregroundStyle(on ? Color.white : c.ink)
                .frame(width: 38, height: 38)
                .background(on ? Color(hex: "#b23a2a") : Color.clear, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func chip(_ icon: String, _ label: String, on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.dyn51(size: 12, weight: .semibold))
                Text(label).font(c.ui(13, .semibold)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(on ? c.bg : c.ink)
            // Prompt 43: pillene kan krympe på smale skjermer i stedet for å skyve knappene ut av kortet.
            .padding(.horizontal, 11).frame(minWidth: 0).frame(height: 34)
            .background(on ? c.ink : Color.clear, in: Capsule())
            .overlay(Capsule().stroke(on ? c.ink : c.line, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .layoutPriority(-1)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
