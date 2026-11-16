import SwiftUI

/* ---------------- Struktur: iOS – Finn ut av Store (AUDIT §6, samme mønster som DomenerModell) ----------------
 Tilstanden og kallene for Finn-handlene bor her. Store eier modellen (store.finnModell) og har videresendende egenskaper
 (store.finn, store.finnSel, store.finnDetail, store.finnBusy) og metoder (loadFinn, openFinn, finnUpload …), så skjermene virker
 som før. Modellen injiseres sammen med Store (homelabMiljo), så nye visninger kan lese den med @Environment(FinnModell.self).
 Kallene får Store som parameter (api, run, flash, message).
 Q19: serveren har alle Finn-endepunktene (server/finans/finn-routes.js), og /api/version sier fra om en for gammel server, så
 «404 → behold listedataene / Oppdater homelab»-reservene er fjernet. En 404 nå betyr at handelen er borte, og vises som feil. */

@MainActor
@Observable
final class FinnModell {
    var finn: FinnList? = nil
    /// Åpen handel (id), detaljen og opplasting/henting som pågår.
    var sel: Int? = nil
    var detail: FinnDetail? = nil
    /// receipts | photos | emails | ad mens det lastes opp eller hentes.
    var busy: String? = nil

    func load(_ store: Store) async throws {
        finn = try await store.api.get("/finn")
        if sel != nil { await loadDetail(store) }
    }

    /// Åpner handelen: listedataene vises med en gang, detaljen (annonse, kvitteringer, e-poster, bilder) hentes etterpå.
    func open(_ id: Int, _ store: Store) {
        sel = id
        if let d = finn?.items.first(where: { (x: FinnDeal) -> Bool in x.id == id }) { detail = FinnDetail(deal: d) } else { detail = nil }
        Task { await self.loadDetail(store) }
    }

    /// GET /finn/:id. Listedataene står til detaljen kommer; feiler kallet, står de fortsatt.
    func loadDetail(_ store: Store) async {
        guard let id = sel else { return }
        do {
            let d: FinnDetail = try await store.api.get("/finn/\(id)", as: FinnDetail.self)
            if sel == id { detail = d }
        } catch let e as APIError where e.status == 401 && store.loggedIn && !e.needsTotp && !e.isTokenExpired {
            store.expired()
        } catch {}
    }

    /// Svaret fra opplasting, sletting og henting er hele handelen.
    private func setDetail(_ d: Data, _ id: Int, _ store: Store) async {
        if let full = try? JSONDecoder().decode(FinnDetail.self, from: d), full.deal.id == id {
            if sel == id { detail = full }
        } else {
            await loadDetail(store)
        }
    }

    /// kind: receipts | photos | emails. Kvitteringer og bilder går til POST /finn/:id/files med kind (receipt | photo),
    /// e-poster (.eml) til POST /finn/:id/emails. Filene ligger i feltet «file».
    func upload(_ kind: String, _ files: [(name: String, mime: String, data: Data)], _ store: Store) {
        guard let id = sel, !files.isEmpty else { return }
        store.run {
            self.busy = kind
            defer { self.busy = nil }
            var parts: [API.Part] = files.map { (f: (name: String, mime: String, data: Data)) -> API.Part in
                API.Part(name: "file", filename: f.name, mime: f.mime, data: f.data)
            }
            let d: Data
            if kind == "emails" {
                d = try await store.api.upload("/finn/\(id)/emails", parts: parts)
            } else {
                parts.append(.text("kind", kind == "photos" ? "photo" : "receipt"))
                d = try await store.api.upload("/finn/\(id)/files", parts: parts)
            }
            await self.setDetail(d, id, store)
            if let f = try? await store.api.get("/finn", as: FinnList.self) { self.finn = f }
            store.flash(FinnModell.uploadText(kind, files.count))
        }
    }

    static func uploadText(_ kind: String, _ n: Int) -> String {
        if kind == "photos" { return n == 1 ? "1 bilde lagt til" : "\(n) bilder lagt til" }
        return kind == "emails" ? "E-posten er lagt ved" : "Kvitteringen er lagt ved"
    }

    /// Kvitteringer og bilder er filer i handelen; e-postene har egen rute.
    func remove(_ kind: String, _ fileId: String, _ store: Store) {
        guard let id = sel else { return }
        store.run {
            let d: Data = try await store.api.call("DELETE", "/finn/\(id)/\(kind == "emails" ? "emails" : "files")/\(fileId)")
            await self.setDetail(d, id, store)
        }
    }

    /// ✦ Hent annonsen (tittel, pris, sted, beskrivelse og bilder). url trengs bare når handelen mangler lenke og Finn-kode.
    func fetchAd(_ url: String?, _ store: Store) {
        guard let id = sel, busy == nil else { return }
        store.run {
            self.busy = "ad"
            defer { self.busy = nil }
            var body: [String: Any] = [:]
            let u: String = (url ?? "").trimmingCharacters(in: .whitespaces)
            if !u.isEmpty { body["url"] = u }
            let d: Data = try await store.api.call("POST", "/finn/\(id)/ad", json: body)
            await self.setDetail(d, id, store)
            let msg: String? = ((try? JSONSerialization.jsonObject(with: d)) as? [String: Any])?["message"] as? String
            store.flash(msg ?? "✦ Annonsen er lagret")
        }
    }
}
