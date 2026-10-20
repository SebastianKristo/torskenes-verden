import SwiftUI
import UIKit

/* ---------------- Prompt 27: Innstillinger → AI og tolkning → CHAT ---------------- */
// Fasit: gruppen CHAT i design/Mobil Papir App.dc.html (Innstillinger → AI og tolkning).
// «Chat kan lese mine data» (chat_my_data, av), «Spør før sky-modeller får data» (chat_ask_cloud, på), standardmodell
// (chat_default_model) og «Åpne chat ›». Administrator ser også Open WebUI-adresse og -nøkkel (openwebui_url, openwebui_key).

struct Chat27SettingsGroup: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var ai: AiSettingsModel { AiSettingsModel.shared }
    @MainActor private var s: ChatStore27 { ChatStore27.shared }
    @State private var url: String = ""
    @State private var key: String = ""
    @State private var urlRead: Bool = false

    private var canEdit: Bool { ai.canEdit ?? store.canEditServer }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            PLabel(text: "Chat").padding(.leading, 4).padding(.top, 14)
            PCard(padding: 0) {
                VStack(spacing: 0) {
                    toggle("Chat kan lese mine data", "Finans, Kalender og Huskeliste når «Mine data» er på · på som standard", "chat_my_data", true)
                    Rectangle().fill(p.line).frame(height: 1)
                    toggle("Spør før sky-modeller får data", "Gemini og Groq må godkjennes per samtale", "chat_ask_cloud", true)
                    Rectangle().fill(p.line).frame(height: 1)
                    modelRow
                    Rectangle().fill(p.line).frame(height: 1)
                    Button { store.openChat() } label: {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Åpne chat").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                                Text("Historikk, modeller og kunnskapsbase").font(PF.ui(12.5)).foregroundStyle(p.mut)
                            }
                            Spacer()
                            Text("›").font(PF.ui(17)).foregroundStyle(p.mut)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            if canEdit { adminCard }
        }
        .task {
            if s.models.isEmpty { await s.loadModels(store) }
        }
    }

    private func toggle(_ t: String, _ sub: String, _ k: String, _ def: Bool) -> some View {
        Toggle(isOn: Binding<Bool>(get: { ai.flag(k, default: def) }, set: { (v: Bool) in
            ai.setFlag(k, v, store)
            if k == "chat_my_data" { s.myDataAllowed = v; if !v { s.dataOn = false } }
            if k == "chat_ask_cloud" { s.askCloud = v }
        })) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Text(sub).font(PF.ui(12.5)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(p.pos)
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private var modelRow: some View {
        let cur: String = JS.str(ai.settings, "chat_default_model") ?? s.defaultModel
        let name: String = s.models.first(where: { $0.id == cur })?.label ?? (cur.isEmpty ? "Automatisk" : cur)
        return Menu {
            ForEach(s.models) { m in
                Button {
                    ai.settings["chat_default_model"] = m.id
                    s.select(m, store)
                } label: {
                    Text(m.label + (m.sky ? " · sky" : " · lokal") + (m.id == cur ? " ✓" : ""))
                }
            }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Standardmodell").font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                    Text("Brukes i nye samtaler").font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                Spacer()
                Text(name + " ›").font(PF.ui(13, .semibold)).foregroundStyle(p.lab).lineLimit(1)
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
    }

    /// Open WebUI er serveroppsett (bare administrator).
    private var adminCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            PCard(padding: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    field("Open WebUI-adresse", text: $url, prompt: "http://192.168.1.40:3000", secure: false)
                    Rectangle().fill(p.line).frame(height: 1)
                    field("Open WebUI-nøkkel", text: $key, prompt: JS.bool(ai.settings, "openwebui_key_set") == true ? "Lagret · skriv ny for å bytte" : "sk-…", secure: true)
                    Rectangle().fill(p.line).frame(height: 1)
                    Button { saveAdmin() } label: {
                        Text("Lagre Open WebUI").font(PF.ui(14, .bold)).foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity).frame(height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 8)
            Text("Uten Open WebUI lagres samtalene på serveren, og Ollama, Gemini og Groq brukes direkte.")
                .font(PF.ui(12)).foregroundStyle(p.mut).padding(.horizontal, 6).padding(.top, 4).fixedSize(horizontal: false, vertical: true)
        }
        .onAppear {
            if !urlRead { url = JS.str(ai.settings, "openwebui_url") ?? ""; urlRead = true }
        }
    }

    private func field(_ t: String, text: Binding<String>, prompt: String, secure: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(t).font(PF.ui(12.5, .semibold)).foregroundStyle(p.mut)
            Group {
                if secure {
                    SecureField("", text: text, prompt: Text(prompt).foregroundColor(p.mut))
                } else {
                    TextField("", text: text, prompt: Text(prompt).foregroundColor(p.mut))
                        .keyboardType(.URL)
                }
            }
            .font(PF.ui(15)).foregroundStyle(p.ink)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private func saveAdmin() {
        let u: String = url.trimmingCharacters(in: .whitespacesAndNewlines)
        ai.settings["openwebui_url"] = u
        store.save("openwebui_url", u)
        let k: String = key.trimmingCharacters(in: .whitespacesAndNewlines)
        if !k.isEmpty {
            store.save("openwebui_key", k)
            ai.settings["openwebui_key_set"] = true
            key = ""
        }
        Haptics.shared.success()
        Task { await s.loadModels(store) }
    }
}
