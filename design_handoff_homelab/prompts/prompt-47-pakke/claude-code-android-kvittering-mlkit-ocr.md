# Android: lokal OCR av kvitteringer med ML Kit → Glimt (Ollama)

Ønske 2026-10-23: lokal OCR på Android med Google ML Kit Text Recognition. Linjestrukturen skal bevares, og råteksten sendes til serveren der Ollama tolker den. Klassen skal hete `ReceiptOcrScanner`, og flyten skal bruke Coroutines og MVVM.

Server: `https://os.smarthjemexperten.no` (ekstern) / `http://10.69.1.39:3000` (lokal), se `claude-code-standard-serveradresser.md`.

## Gradle (`app/build.gradle.kts`)
```kotlin
dependencies {
    implementation("com.google.android.gms:play-services-mlkit-text-recognition:19.0.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
```

## Manifest (`AndroidManifest.xml`)
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <!-- Ikke deklarer CAMERA: TakePicture-intent trenger den ikke, og hvis den er deklarert men ikke gitt, feiler intenten. -->

    <application
        android:networkSecurityConfig="@xml/network_security_config"
        ...>

        <!-- Last ned OCR-modellen via Play-tjenester ved installasjon, ikke ved første skanning -->
        <meta-data
            android:name="com.google.mlkit.vision.DEPENDENCIES"
            android:value="ocr" />

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
```

`res/xml/file_paths.xml`
```xml
<paths>
    <cache-path name="receipts" path="receipts/" />
</paths>
```

`res/xml/network_security_config.xml` (klartekst bare til lokal server)
```xml
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">10.69.1.39</domain>
    </domain-config>
</network-security-config>
```

## `ReceiptOcrScanner.kt`
```kotlin
package no.papir.finans.receipt

import android.content.Context
import android.graphics.Rect
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.Closeable
import kotlin.math.abs

class ReceiptOcrScanner(
    private val recognizer: TextRecognizer =
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS),
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : Closeable {

    /** Kjører helt på enheten. Kaster [ReceiptOcrException] ved feil eller tom kvittering. */
    suspend fun extractTextFromReceipt(context: Context, imageUri: Uri): String {
        val image = withContext(ioDispatcher) {
            runCatching { InputImage.fromFilePath(context.applicationContext, imageUri) } // håndterer EXIF-rotasjon
                .getOrElse { throw ReceiptOcrException("Kunne ikke lese bildet", it) }
        }
        val result = runCatching { recognizer.process(image).await() }
            .getOrElse { throw ReceiptOcrException("Tekstgjenkjenning feilet", it) }

        return ReceiptTextFormatter.format(result).ifBlank {
            throw ReceiptOcrException("Fant ingen tekst på kvitteringen")
        }
    }

    override fun close() = recognizer.close()
}

class ReceiptOcrException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * ML Kit leser ofte varenavn (venstre) og pris (høyre) som separate blokker.
 * Linjene grupperes derfor i rader etter vertikal posisjon og sorteres venstre→høyre,
 * med tab mellom kolonner, slik at Ollama ser kvitteringen slik den er trykt.
 */
internal object ReceiptTextFormatter {

    private data class OcrLine(val text: String, val box: Rect) {
        val centerY get() = box.exactCenterY()
    }

    fun format(text: Text): String {
        val lines = text.textBlocks
            .flatMap { it.lines }
            .mapNotNull { line ->
                val box = line.boundingBox ?: return@mapNotNull null
                val clean = line.text.normalizeWhitespace()
                if (clean.isEmpty()) null else OcrLine(clean, box)
            }
        if (lines.isEmpty()) return text.text.trim()

        val heights = lines.map { it.box.height() }.sorted()
        val tolerance = heights[heights.size / 2].coerceAtLeast(1) * 0.5f

        val rows = mutableListOf<MutableList<OcrLine>>()
        for (line in lines.sortedBy { it.centerY }) {
            val row = rows.lastOrNull()
            if (row != null && abs(row.map { it.centerY }.average() - line.centerY) <= tolerance) {
                row += line
            } else {
                rows += mutableListOf(line)
            }
        }

        return rows.joinToString("\n") { row ->
            row.sortedBy { it.box.left }.joinToString("\t") { it.text }
        }
    }

    private fun String.normalizeWhitespace() =
        replace('\u00A0', ' ').replace(Regex("[ ]{2,}"), " ").trim()
}
```

## `ReceiptRepository.kt`
```kotlin
package no.papir.finans.receipt

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class ReceiptRepository(
    private val http: OkHttpClient,
    private val baseUrl: () -> String,          // fra Innstillinger → Server (lokal/ekstern)
    private val authToken: () -> String?,
) {
    suspend fun sendForParsing(ocrText: String): String = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("ocrText", ocrText)
            .put("kilde", "android-mlkit")
            .toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())

        val request = Request.Builder()
            .url("${baseUrl().trimEnd('/')}/api/finans/kvitteringer/ocr")
            .post(body)
            .apply { authToken()?.let { header("Authorization", "Bearer $it") } }
            .build()

        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Server svarte ${response.code}")
            response.body?.string().orEmpty()   // strukturert kvittering fra Glimt (JSON)
        }
    }
}
```

## `ReceiptScanViewModel.kt`
```kotlin
package no.papir.finans.receipt

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ReceiptScanUiState {
    data object Idle : ReceiptScanUiState
    data object Scanning : ReceiptScanUiState
    data class TextReady(val ocrText: String) : ReceiptScanUiState
    data object Uploading : ReceiptScanUiState
    data class Parsed(val json: String) : ReceiptScanUiState
    data class Error(val message: String, val ocrText: String? = null) : ReceiptScanUiState
}

class ReceiptScanViewModel(
    application: Application,
    private val scanner: ReceiptOcrScanner,
    private val repository: ReceiptRepository,
) : AndroidViewModel(application) {

    private val _state = MutableStateFlow<ReceiptScanUiState>(ReceiptScanUiState.Idle)
    val state: StateFlow<ReceiptScanUiState> = _state.asStateFlow()
    private var job: Job? = null

    fun onImageSelected(uri: Uri) {
        job?.cancel()
        job = viewModelScope.launch {
            _state.value = ReceiptScanUiState.Scanning
            _state.value = try {
                ReceiptScanUiState.TextReady(scanner.extractTextFromReceipt(getApplication(), uri))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ReceiptScanUiState.Error(e.message ?: "Ukjent feil")
            }
        }
    }

    fun send(ocrText: String) {
        job?.cancel()
        job = viewModelScope.launch {
            _state.value = ReceiptScanUiState.Uploading
            _state.value = try {
                ReceiptScanUiState.Parsed(repository.sendForParsing(ocrText))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ReceiptScanUiState.Error("Kunne ikke sende til Glimt: ${e.message}", ocrText) // behold teksten for nytt forsøk
            }
        }
    }

    fun reset() { job?.cancel(); _state.value = ReceiptScanUiState.Idle }

    override fun onCleared() = scanner.close()
}
```

## `ReceiptScanScreen.kt`
```kotlin
package no.papir.finans.receipt

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.io.File

@Composable
fun ReceiptScanScreen(viewModel: ReceiptScanViewModel) {
    val context = LocalContext.current
    val state by viewModel.state.collectAsStateWithLifecycle()
    var pendingCaptureUri by rememberSaveable { mutableStateOf<Uri?>(null) }

    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        pendingCaptureUri?.takeIf { ok }?.let(viewModel::onImageSelected)
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let(viewModel::onImageSelected)
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                val uri = context.newReceiptUri()
                pendingCaptureUri = uri
                takePicture.launch(uri)
            }) { Text("Ta bilde") }
            OutlinedButton(onClick = {
                pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            }) { Text("Velg bilde") }
        }

        when (val s = state) {
            ReceiptScanUiState.Idle -> Unit
            ReceiptScanUiState.Scanning -> LinearProgressIndicator(Modifier.fillMaxWidth())
            is ReceiptScanUiState.TextReady -> {
                OcrPreview(s.ocrText, Modifier.weight(1f))
                Button(onClick = { viewModel.send(s.ocrText) }) { Text("Send til Glimt") }
            }
            ReceiptScanUiState.Uploading -> LinearProgressIndicator(Modifier.fillMaxWidth())
            is ReceiptScanUiState.Parsed -> Text("Kvitteringen er tolket")
            is ReceiptScanUiState.Error -> {
                Text(s.message, color = MaterialTheme.colorScheme.error)
                s.ocrText?.let { Button(onClick = { viewModel.send(it) }) { Text("Prøv igjen") } }
            }
        }
    }
}

@Composable
private fun OcrPreview(text: String, modifier: Modifier = Modifier) {
    Surface(modifier.fillMaxWidth(), tonalElevation = 1.dp, shape = MaterialTheme.shapes.medium) {
        Text(
            text = text,
            fontFamily = FontFamily.Monospace,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.verticalScroll(rememberScrollState()).padding(12.dp),
        )
    }
}

private fun Context.newReceiptUri(): Uri {
    val dir = File(cacheDir, "receipts").apply { mkdirs() }
    val file = File(dir, "receipt_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
}
```

## Oppsett av ViewModel
```kotlin
val vm: ReceiptScanViewModel = viewModel {
    val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]!!
    ReceiptScanViewModel(
        application = app,
        scanner = ReceiptOcrScanner(),
        repository = ReceiptRepository(
            http = AppGraph.okHttp,                       // delt klient
            baseUrl = { AppGraph.serverSettings.activeUrl }, // lokal hjemme, ellers ekstern
            authToken = { AppGraph.session.token },
        ),
    )
}
```

## Serveren
`POST /api/finans/kvitteringer/ocr` tar imot `{ ocrText, kilde }` og sender teksten til Glimt/Ollama med samme JSON-skjema som iOS bruker (`claude-code-ios-kvittering-foundation-models.md`). Svaret er samme datamodell og samme bekreftelsesskjerm.

## Test
- `ReceiptTextFormatter`: enhetstest med falske `Text`-linjer der varenavn og pris ligger i hver sin blokk på samme høyde → én rad med tab mellom.
- Flymodus: OCR fungerer. Sending feiler med «Prøv igjen», og teksten beholdes.
- Rotert bilde fra galleri (EXIF 90°) gir riktig tekst.
