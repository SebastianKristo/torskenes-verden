import SwiftUI

/* ---------------- Prompt 57: én lastefunksjon per skjerm for pull-to-refresh ----------------
 Fasit: prompts/prompt-57-pakke/claude-code-refresh-fiks.md.
 Feilen: dra ned ga ofte to spinnere (systemets og listens egen), og systemspinneren ble stående til appen ble lukket.
 - Samtidige lastinger for samme skjerm: en ny lasting avbryter den forrige (bare én kjører).
 - Lastingen kjører i en egen Task som `.refreshable` venter på. Avbryter SwiftUI selve refresh-oppgaven (ny visning,
   fanebytte), fortsetter lastingen, og spinneren får alltid svar.
 - Senest etter 15 s returnerer `kjor` uansett (også om et kall aldri svarer). Gamle data står, og «Kunne ikke oppdatere»
   vises som en liten melding.
 - Når appen kommer tilbake fra bakgrunnen: en lasting som har stått i over 15 s, startes på nytt (`blittAktiv`). */

@MainActor @Observable
final class Oppfrisking {
    static let shared: Oppfrisking = Oppfrisking()
    static let tidsavbrudd: TimeInterval = 15

    private struct Jobb {
        let id: UUID
        let task: Task<Void, Never>
        let startet: Date
        let arbeid: @MainActor () async -> Void
    }

    @ObservationIgnored private var jobber: [String: Jobb] = [:]
    /// Skjermene som laster akkurat nå (for «ingen egen spinner under pull-to-refresh»).
    private(set) var aktive: Set<String> = []

    /// Kjør `arbeid` som eneste lasting for `nokkel`, og vent til den er ferdig eller har brukt 15 s.
    /// Returnerer true når lastingen ble ferdig i tide.
    @discardableResult
    func kjor(_ nokkel: String, _ arbeid: @escaping @MainActor () async -> Void) async -> Bool {
        let jobb: Jobb = start(nokkel, arbeid)
        let ferdig: Bool = await Oppfrisking.vent(jobb.task, sekunder: Oppfrisking.tidsavbrudd)
        if !ferdig {
            // Tidsavbrudd: stopp lastingen, behold dataene og si fra diskret.
            jobb.task.cancel()
            avslutt(nokkel, jobb.id)
            Oppfrisking.melding()
        }
        return ferdig
    }

    /// Avbrutt fordi en ny lasting tok over (eller visningen forsvant): ingen feilmelding.
    nonisolated static func erAvbrutt(_ e: Error) -> Bool {
        if e is CancellationError { return true }
        if let u = e as? URLError, u.code == .cancelled { return true }
        if let h = e as? HomelabError, h.transportCode == URLError.cancelled.rawValue { return true }
        return false
    }

    /// True mens en lasting for `nokkel` pågår.
    func laster(_ nokkel: String) -> Bool { aktive.contains(nokkel) }

    /// Fra bakgrunnen: en lasting som har hengt i over 15 s, avbrytes og startes på nytt.
    func blittAktiv() {
        let na: Date = Date()
        for (nokkel, jobb) in jobber where na.timeIntervalSince(jobb.startet) > Oppfrisking.tidsavbrudd {
            jobb.task.cancel()
            let arbeid: @MainActor () async -> Void = jobb.arbeid
            Task { @MainActor in _ = await Oppfrisking.shared.kjor(nokkel, arbeid) }
        }
    }

    private func start(_ nokkel: String, _ arbeid: @escaping @MainActor () async -> Void) -> Jobb {
        jobber[nokkel]?.task.cancel()
        let id: UUID = UUID()
        let task: Task<Void, Never> = Task { @MainActor in
            // `defer`: tilstanden nullstilles alltid, også ved feil og avbrudd.
            defer { Oppfrisking.shared.avslutt(nokkel, id) }
            await arbeid()
        }
        let jobb: Jobb = Jobb(id: id, task: task, startet: Date(), arbeid: arbeid)
        jobber[nokkel] = jobb
        aktive.insert(nokkel)
        return jobb
    }

    private func avslutt(_ nokkel: String, _ id: UUID) {
        guard jobber[nokkel]?.id == id else { return }
        jobber[nokkel] = nil
        aktive.remove(nokkel)
    }

    /// Venter på oppgaven, men aldri lenger enn `sekunder`. En engangs-continuation, så den svarer nøyaktig én gang
    /// selv om oppgaven aldri blir ferdig.
    private static func vent(_ task: Task<Void, Never>, sekunder: TimeInterval) async -> Bool {
        await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            let svar: EngangsSvar = EngangsSvar(c)
            Task { @MainActor in await task.value; svar.gi(true) }
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(sekunder * 1_000_000_000))
                svar.gi(false)
            }
        }
    }

    /// «Kunne ikke oppdatere» som den vanlige lille meldingen nederst (Store.flash). Gamle data står.
    private static func melding() {
        Notify31.store?.flash("Kunne ikke oppdatere")
    }
}

/// Svarer en continuation bare én gang.
@MainActor
private final class EngangsSvar {
    private var c: CheckedContinuation<Bool, Never>?
    init(_ c: CheckedContinuation<Bool, Never>) { self.c = c }
    func gi(_ v: Bool) {
        guard let c else { return }
        self.c = nil
        c.resume(returning: v)
    }
}

extension View {
    /// Pull-to-refresh med én lasting per skjerm, uten `Task {}` inni `.refreshable` og med 15 s tidsavbrudd.
    func oppfrisk(_ nokkel: String, _ arbeid: @escaping @MainActor () async -> Void) -> some View {
        refreshable { _ = await Oppfrisking.shared.kjor(nokkel, arbeid) }
    }
}
