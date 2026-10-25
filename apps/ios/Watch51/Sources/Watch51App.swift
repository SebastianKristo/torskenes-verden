import SwiftUI

/* ---------------- Prompt 51 (IOSPLAT51): FinansHub for Apple Watch ----------------
 Hjem: Sjekk inn, «Hent meg», Avganger, Handleliste og Glimt (tale via diktering i tekstfeltet). Innlogging via iPhone
 (Watch51Store.swift). Små body-er; alle knapper har tekst eller VoiceOver-etikett, og tekst bruker tekststilene
 (følger Dynamisk tekst på klokka). */

@main
struct FinansHubWatch51App: App {
    @State private var store: W51Store = W51Store.shared

    init() {
        W51Phone.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                if store.loggedIn {
                    W51HomeView()
                } else {
                    W51LoginView()
                }
            }
            .environment(store)
        }
    }
}

/* ---------- Innlogging ---------- */

struct W51LoginView: View {
    @Environment(W51Store.self) private var store

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("FinansHub").font(.headline)
                Text(store.info.isEmpty ? "Logg inn med FinansHub på iPhone. Du godkjenner med Face ID der." : store.info)
                    .font(.footnote).foregroundStyle(store.phase == "error" ? Color.red : Color.secondary)
                if store.phase == "match" && !store.match.isEmpty {
                    W51MatchView(match: store.match)
                }
                W51LoginButtons()
            }
        }
        .navigationTitle("Logg inn")
    }
}

struct W51MatchView: View {
    let match: String
    var body: some View {
        VStack(spacing: 2) {
            Text("Tallet på iPhone").font(.caption2).foregroundStyle(Color.secondary)
            Text(match).font(.system(.largeTitle, design: .rounded).weight(.bold)).monospacedDigit()
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

struct W51LoginButtons: View {
    @Environment(W51Store.self) private var store

    private var working: Bool { ["phone", "waiting", "match"].contains(store.phase) }

    var body: some View {
        if working {
            ProgressView().frame(maxWidth: .infinity)
            Button("Avbryt", role: .cancel) { store.cancelPair() }
        } else {
            Button {
                Task { await store.pair() }
            } label: {
                Label("Logg inn via iPhone", systemImage: "iphone")
            }
            .tint(Color.orange)
        }
    }
}

/* ---------- Hjem ---------- */

struct W51HomeView: View {
    @Environment(W51Store.self) private var store

    var body: some View {
        List {
            NavigationLink { W51CheckinView() } label: { Label("Sjekk inn", systemImage: "checkmark.message.fill") }
            NavigationLink { W51PickupView() } label: { Label("Hent meg", systemImage: "car.fill") }
            NavigationLink { W51DeparturesView() } label: { Label("Avganger", systemImage: "bus.fill") }
            NavigationLink { W51ShopView() } label: { Label("Handleliste", systemImage: "cart.fill") }
            NavigationLink { W51GlimtView() } label: { Label("Glimt", systemImage: "sparkles") }
            NavigationLink { W51MediaView() } label: { Label("Spilles nå", systemImage: "play.tv.fill") } // prompt 51 (MEDCTL51), Watch51Media.swift
            Section {
                Button(role: .destructive) { store.logout() } label: { Label("Logg ut", systemImage: "rectangle.portrait.and.arrow.right") }
            } footer: {
                if !store.name.isEmpty { Text("Logget inn som " + store.name) }
            }
        }
        .navigationTitle("FinansHub")
    }
}

/* ---------- Sjekk inn ---------- */

struct W51CheckinView: View {
    @Environment(W51Store.self) private var store

    private var options: [W51Quick] {
        if !store.quick.isEmpty { return store.quick }
        return [W51Quick(id: "arrived", text: "Er framme"), W51Quick(id: "party", text: "Alt bra"), W51Quick(id: "late", text: "Blir sent")]
    }

    var body: some View {
        List {
            Section {
                ForEach(options) { (q: W51Quick) in
                    Button {
                        Task { _ = await store.checkIn(q.id) }
                    } label: {
                        Text(q.text).lineLimit(2)
                    }
                    .disabled(store.busy)
                }
            } footer: {
                Text(store.flash.isEmpty ? "Sendes til " + store.recipients + "." : store.flash)
            }
        }
        .navigationTitle("Sjekk inn")
        .task {
            store.flash = ""
            await store.loadCheckin()
        }
    }
}

struct W51PickupView: View {
    @Environment(W51Store.self) private var store
    @State private var confirm: Bool = false

    var body: some View {
        VStack(spacing: 10) {
            Button {
                confirm = true
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "car.fill").font(.title2)
                    Text("Hent meg").font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 80)
            }
            .tint(Color.red)
            .disabled(store.busy)
            Text(store.flash.isEmpty ? "Familien får varsel med høy prioritet og posisjonen din." : store.flash)
                .font(.footnote).foregroundStyle(Color.secondary).multilineTextAlignment(.center)
        }
        .navigationTitle("Hent meg")
        .confirmationDialog("Be " + store.recipients + " hente deg?", isPresented: $confirm) {
            Button("Send «Hent meg»") { Task { _ = await store.checkIn("pickup") } }
            Button("Avbryt", role: .cancel) { }
        }
        .task {
            store.flash = ""
            await store.loadCheckin()
        }
    }
}

/* ---------- Avganger ---------- */

struct W51DepRow: View {
    let dep: W51Dep

    var body: some View {
        HStack {
            Text(dep.line).font(.headline).monospacedDigit()
            Text(dep.dest).font(.footnote).lineLimit(1)
            Spacer(minLength: 2)
            Text(dep.minutes == 0 ? "nå" : "\(dep.minutes) min").font(.footnote.weight(.semibold)).monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }
}

struct W51DeparturesView: View {
    @Environment(W51Store.self) private var store

    var body: some View {
        List {
            if store.stops.isEmpty {
                Text(store.flash.isEmpty ? "Ingen avganger. Velg stopp under Avganger i appen på iPhone." : store.flash).font(.footnote)
            }
            ForEach(store.stops) { (s: W51Stop) in
                Section(s.name) {
                    ForEach(s.deps.prefix(5)) { (d: W51Dep) in W51DepRow(dep: d) }
                }
            }
        }
        .navigationTitle("Avganger")
        .task {
            store.flash = ""
            await store.loadDepartures()
        }
        .refreshable { await store.loadDepartures() }
    }
}

/* ---------- Handleliste ---------- */

struct W51ShopView: View {
    @Environment(W51Store.self) private var store
    @State private var text: String = ""

    var body: some View {
        List {
            // Tekstfeltet på klokka gir diktering, skribling og tastatur.
            TextField("Legg til vare", text: $text)
                .onSubmit {
                    let t: String = text
                    text = ""
                    Task { await store.addShop(t) }
                }
            ForEach(store.shop) { (it: W51ShopItem) in
                Button {
                    Task { await store.toggleShop(it) }
                } label: {
                    Label(it.text, systemImage: it.done ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(it.done ? Color.secondary : Color.primary)
                }
                .accessibilityValue(it.done ? "Kjøpt" : "Ikke kjøpt")
            }
            if !store.flash.isEmpty { Text(store.flash).font(.footnote) }
        }
        .navigationTitle("Handleliste")
        .task {
            store.flash = ""
            await store.loadShop()
        }
    }
}

/* ---------- Glimt ---------- */

struct W51GlimtView: View {
    @Environment(W51Store.self) private var store
    @State private var text: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                TextField("Spør Glimt", text: $text)
                    .onSubmit {
                        let t: String = text
                        text = ""
                        Task { await store.ask(t) }
                    }
                if store.glimtBusy && store.glimtAnswer.isEmpty { ProgressView() }
                if !store.glimtAnswer.isEmpty {
                    Text(store.glimtAnswer).font(.body)
                    Button("Ny samtale") { store.newChat() }.font(.footnote)
                }
            }
        }
        .navigationTitle("Glimt")
    }
}
