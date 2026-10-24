package no.kristo.kalender.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.launch
import no.kristo.kalender.Green
import no.kristo.kalender.Hap
import no.kristo.kalender.Kal41
import no.kristo.kalender.Kal47Srv
import no.kristo.kalender.LocalK
import no.kristo.kalender.Red

/* Prompt 47: Innstillinger → Server (ekstern og lokal adresse, standardverdier, Test, Tilbakestill til standard). Logikk: Kal47.kt. */

@Composable
fun ServerDialog47(onClose: () -> Unit) {
    val k = LocalK.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var ext by remember { mutableStateOf(Kal41.external(ctx)) }
    var loc by remember { mutableStateOf(Kal41.local(ctx).firstOrNull() ?: Kal47Srv.stdLocal(ctx)) }
    var extMs by remember { mutableStateOf<Long?>(null) }
    var locMs by remember { mutableStateOf<Long?>(null) }
    var msg by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    fun test(external: Boolean) {
        val b = Kal47Srv.normalize(if (external) ext else loc)
        if (b == null) { if (external) extMs = 0 else locMs = 0; return }
        if (external) extMs = -1 else locMs = -1
        scope.launch {
            val ms = Kal47Srv.ping(b, if (external) 6000 else 1500) ?: 0L
            if (external) extMs = ms else locMs = ms
        }
    }
    LaunchedEffect(Unit) { test(true); test(false) }

    Dialog(onDismissRequest = onClose) {
        Column(
            Modifier.clip(RoundedCornerShape(24.dp)).background(k.card).verticalScroll(rememberScrollState()).padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Tx("Server", news(22.sp, k.ink))
            SrvField47("EKSTERN ADRESSE", ext, { ext = it }, Kal47Srv.stdExternal(ctx), extMs) { Hap.tick(); test(true) }
            SrvField47("LOKAL ADRESSE", loc, { loc = it }, Kal47Srv.stdLocal(ctx), locMs) { Hap.tick(); test(false) }
            Tx("Hjemme (lokal adresse svarer innen 1,5 s) brukes lokal, ellers ekstern. Endringer synkes til dine andre enheter.",
                man(12.sp, FontWeight.Medium, k.mut), maxLines = 4)
            if (msg.isNotBlank()) Tx(msg, man(12.5.sp, FontWeight.SemiBold, k.ink2), maxLines = 3)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LinePill("Tilbakestill til standard", {
                    Hap.tick(); busy = true
                    scope.launch {
                        val r = Kal47Srv.reset(ctx)
                        msg = r.first; ext = r.second; loc = r.third; busy = false
                        test(true); test(false)
                    }
                })
                Spacer(Modifier.weight(1f))
                InkPill(if (busy) "Lagrer …" else "Lagre", {
                    val e = Kal47Srv.normalize(ext)
                    val l = if (loc.isBlank()) "" else Kal47Srv.normalize(loc)
                    when {
                        e == null -> msg = "Ekstern adresse må være en gyldig adresse (https://…)"
                        l == null -> msg = "Lokal adresse må være en gyldig adresse (http://…)"
                        else -> {
                            ext = e; loc = l; busy = true
                            scope.launch { msg = Kal47Srv.save(ctx, e, l); busy = false; test(true); test(false) }
                        }
                    }
                }, enabled = !busy)
            }
            Row { Spacer(Modifier.weight(1f)); LinePill("Ferdig", onClose) }
        }
    }
}

@Composable
private fun SrvField47(label: String, v: String, on: (String) -> Unit, hint: String, ms: Long?, test: () -> Unit) {
    val k = LocalK.current
    val col = when { ms == null || ms < 0 -> k.mut; ms == 0L -> Red; else -> Green }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Label(label)
        Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).background(k.bg).border(1.dp, k.line, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp),
            contentAlignment = Alignment.CenterStart) {
            if (v.isEmpty()) Tx(hint, mono(13.5.sp, k.mut2))
            BasicTextField(v, on, Modifier.fillMaxWidth().semantics { contentDescription = label }, textStyle = mono(13.5.sp, k.ink), singleLine = true,
                cursorBrush = SolidColor(Red), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done, autoCorrectEnabled = false))
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(col))
            Tx(Kal47Srv.status(ms), man(12.sp, FontWeight.SemiBold, col), Modifier.weight(1f))
            Box(Modifier.height(36.dp).tap("Test", onClick = test).padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                Tx("Test", man(12.5.sp, FontWeight.Bold, k.acc))
            }
        }
    }
}
