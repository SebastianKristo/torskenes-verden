package no.kristo.finanshub.ui

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType

// Prompt 42: den klassiske innloggingen (Material You) er slettet. Innlogging og «Legg til konto» er PaperLogin (Paper14.kt).

/** Adressefelt: URL-tastatur uten stor forbokstav eller autokorrektur (ødelegger adressen). */
internal val ServerKeyboard = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next)
