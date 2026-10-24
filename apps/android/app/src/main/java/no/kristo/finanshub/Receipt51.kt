package no.kristo.finanshub

import org.json.JSONObject

/*
 * Prompt 51 (RCPTUI51) – kvitteringsrettingen i Android-appen (feltnavn fra SERVER51-API.md, RCPTSRV51):
 *   - kilden til butikknavnet: merchant_source (orgnr | known | model | user) og merchant_label («fra org.nr.», «kjent butikk»,
 *     «modellens forslag», «rettet av deg») fra serveren, vist som merkelapp ved butikkfeltet (ui/Receipt51Ui.kt)
 *   - «Rådata»: ocr_raw {engine, engine_label, rows, image_size, ms, preprocess} fra GET /finans/api/receipts/:id
 *   - rettet butikknavn → POST /receipts/:id/merchant {merchant, org_number?}, så serveren lærer org.nr. → visningsnavn
 *   - bildet: originalen sendes som «image» (Lagre originalbildet på), ellers den oppreiste JPEG-en på ca. 2000 px
 *     (ReceiptImage48) – aldri bare 1600 px-kopien.
 */

/** OCR-radene som ble lest for kvitteringen. */
data class OcrRaw51(
    val engine: String?, val engineLabel: String, val rows: List<String>, val width: Int?, val height: Int?, val ms: Long?, val preprocess: String,
) {
    val sizeText: String get() = if (width != null && height != null && width > 0 && height > 0) "$width × $height px" else "ukjent"
}

internal fun engineName51(e: String?): String = when (e) {
    "mac_vision" -> "Mac Vision"; "tesseract" -> "Tesseract"; "ios_vision" -> "iPhone (Vision)"; "android_mlkit" -> "Android (ML Kit)"; else -> e ?: "ukjent"
}

/** ocr_raw → OcrRaw51. Tålende: feil form gir null, aldri unntak. */
internal fun parseOcrRaw51(o: JSONObject?): OcrRaw51? = runCatching {
    if (o == null) return@runCatching null
    val rows = o.optJSONArray("rows")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()
    val size = o.optJSONArray("image_size")
    val w = size?.takeIf { it.length() == 2 }?.optDouble(0)?.takeIf { !it.isNaN() }?.toInt()
    val h = size?.takeIf { it.length() == 2 }?.optDouble(1)?.takeIf { !it.isNaN() }?.toInt()
    val pre = o.optJSONObject("preprocess")?.let { p ->
        listOfNotNull(
            "rotert".takeIf { p.optBoolean("rotated") }, "perspektiv rettet".takeIf { p.optBoolean("perspective") },
            "beskåret".takeIf { p.optBoolean("cropped") }, "skalert opp".takeIf { p.optBoolean("upscaled") },
            when (p.optStr("from")) { "scan" -> "fra 1600 px-kopien"; "original" -> "fra originalen"; else -> null },
        ).joinToString(", ")
    } ?: ""
    val engine = o.optStr("engine")
    OcrRaw51(engine, o.optStr("engine_label") ?: engineName51(engine), rows, w, h, o.optDoubleOrNull("ms")?.toLong(), pre)
}.getOrNull()

/** Teksten på merkelappen for kilden til butikknavnet, eller null når serveren ikke oppgir den. */
internal fun merchantSourceText51(source: String?, label: String?): String? = label?.takeIf { it.isNotBlank() } ?: when (source) {
    "orgnr" -> "fra org.nr."; "known" -> "kjent butikk"; "model" -> "modellens forslag"; "user" -> "rettet av deg"; else -> null
}

/**
 * Rettet butikknavn → serveren lærer org.nr. → visningsnavn (POST /receipts/:id/merchant). false = eldre server (404/405) eller
 * feil – da går navnet med PATCH som før (serveren lærer også der).
 */
internal suspend fun AppViewModel.learnMerchant51(id: String, merchant: String, org: String? = null): Boolean {
    val m = merchant.trim()
    if (m.isEmpty()) return false
    val body = JSONObject().put("merchant", m)
    val digits = org?.filter { it.isDigit() }.orEmpty()
    if (digits.length == 9) body.put("org_number", digits)
    return runCatching { api48 { request("POST", "/receipts/$id/merchant", body) } }.isSuccess
}

/** ocr_raw for én kvittering (når listen eller svaret ikke hadde den med). null = ingen OCR lagret eller feil. */
internal suspend fun AppViewModel.loadOcrRaw51(id: String): OcrRaw51? =
    runCatching { parseOcrRaw51(JSONObject(api48 { get("/receipts/$id") }).optJSONObject("ocr_raw")) }.getOrNull()
