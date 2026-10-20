import SwiftUI
import UIKit

/* ---------------- Prompt 24: navn på appen og app-ikon (claude-code-app-ikon-navn.md) ---------------- */
// iOS: ikonet byttes med setAlternateIconName (AppIcon-Monogram og AppIcon-Rom i Assets.xcassets og
// ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES i project.yml). CFBundleDisplayName kan ikke endres under kjøring,
// så et fritt navn (maks 20 tegn) brukes inne i appen. Begge lagres per bruker i /api/me/layout (appName, appIcon).

extension AppMeta {
    static let maxName24: Int = 20

    /// Brukerens eget navn (layout.appName) overstyrer navnet på serveren (/api/app).
    func load24(_ store: Store) async {
        guard let d = try? await store.api.callAt("/api", "GET", "/me/layout", timeout: 10) else { return }
        let o: [String: Any] = JS.obj(d)
        if let n = JS.str(o, "appName"), !n.isEmpty, n != name { name = n }
    }

    func setName24(_ raw: String, _ store: Store) {
        let v: String = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !v.isEmpty else { store.flash("Skriv inn et navn"); return }
        let next: String = String(v.prefix(AppMeta.maxName24))
        let old: String = name
        name = next
        Haptics.shared.success()
        Task {
            do {
                _ = try await store.api.callAt("/api", "PUT", "/me/layout", json: ["appName": next])
                store.flash("Appen heter nå «\(next)» inne i appen")
            } catch let e as APIError {
                if e.status == 400 {
                    self.name = old
                    store.flash("Kunne ikke lagre navnet: \(e.message)")
                } else {
                    store.flash("Navnet er lagret på denne telefonen. Serveren svarte: \(e.message)")
                }
            } catch {
                store.flash("Navnet er lagret på denne telefonen.")
            }
        }
    }

    /// Tilbakestill: fjern eget navn og bruk navnet fra serveren (eller «Homelab»).
    func resetName24(_ store: Store) {
        name = AppMeta.suggestions.first ?? "Homelab"
        Haptics.shared.select()
        Task {
            var body: [String: Any] = [:]
            body["appName"] = NSNull()
            _ = try? await store.api.callAt("/api", "PUT", "/me/layout", json: body)
            await self.load(store)
            store.flash("Navnet er tilbakestilt til «\(self.name)»")
        }
    }

    var iconPreview24: String { AppMeta.icons.first { $0.0 == icon }?.2 ?? "IconPreviewMonogram" }
}

/// Innstillinger → Navn på appen: tekstfelt (maks 20 tegn), forhåndsvisning slik det ser ut på hjemskjermen,
/// ferdige forslag, Lagre og Tilbakestill.
struct AppName24Sheet: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    let close: () -> Void
    @State private var name: String = AppMeta.shared.name

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Navn på appen").font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
                Text("Brukes på Hjem, i widgets og i varsler.").font(PF.ui(13)).foregroundStyle(p.mut)
                preview
                HStack(alignment: .firstTextBaseline) {
                    TextField("Navn", text: $name)
                        .font(PF.serif(20))
                        .foregroundStyle(p.ink)
                        .textInputAutocapitalization(.words)
                        .onChange(of: name) { _, v in
                            if v.count > AppMeta.maxName24 { name = String(v.prefix(AppMeta.maxName24)) }
                        }
                    Text("\(name.count)/\(AppMeta.maxName24)").font(PF.mono(11, bold: false)).foregroundStyle(p.mut)
                }
                .padding(.vertical, 8)
                .overlay(alignment: .bottom) { Rectangle().fill(p.lab).frame(height: 2) }
                BdFlow24(spacing: 8) {
                    ForEach(suggestions, id: \.self) { s in
                        Button { name = s } label: {
                            Text(s).font(PF.ui(13, .semibold)).foregroundStyle(name == s ? p.bg : p.ink).padding(.horizontal, 14).frame(height: 34)
                                .background(name == s ? p.ink : p.card, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                Text("Navnet under ikonet på hjemskjermen kan ikke endres på iPhone. Vil du ha eget navn der, kan du legge til en snarvei med Snarveier-appen.")
                    .font(PF.ui(12)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    PLineButton(title: "Tilbakestill", height: 48, full: true) {
                        AppMeta.shared.resetName24(store)
                        close()
                    }
                    PInkButton(title: "Lagre", height: 48, full: true) {
                        AppMeta.shared.setName24(name, store)
                        close()
                    }
                }
                .padding(.top, 4)
            }
            .padding(20)
        }
        .environment(\.colorScheme, p.dark ? .dark : .light)
    }

    private var suggestions: [String] {
        var out: [String] = AppMeta.suggestions
        for s in ["Hjem", "Familie", "Finans", "Papir"] where !out.contains(s) { out.append(s) }
        return out
    }

    /// Ikon og navn som på hjemskjermen.
    private var preview: some View {
        HStack {
            Spacer()
            VStack(spacing: 6) {
                Image(AppMeta.shared.iconPreview24).resizable().scaledToFit().frame(width: 62, height: 62)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: .black.opacity(0.2), radius: 6, y: 3)
                Text(name.isEmpty ? " " : name).font(.system(size: 12, weight: .medium)).foregroundStyle(.white).lineLimit(1)
                    .frame(maxWidth: 90)
            }
            .padding(.vertical, 16)
            Spacer()
        }
        .background(LinearGradient(colors: [Color(hex: "#6d7f8f"), Color(hex: "#2e3a46")], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
