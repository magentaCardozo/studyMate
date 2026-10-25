package com.studymateai.feature.scanner

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.pdf.PdfDocument
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.RotateRight
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.studymateai.core.designsystem.ErrorState
import com.studymateai.core.designsystem.Notice
import com.studymateai.core.designsystem.PrimaryButton
import com.studymateai.core.designsystem.SM
import com.studymateai.core.designsystem.SecondaryButton
import com.studymateai.core.network.toUserMessage
import com.studymateai.feature.common.container
import com.studymateai.feature.courses.BackBar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

data class ScannedPage(val file: File, val rotation: Int = 0)

/** Assemble les pages (rotation appliquée, ≤ 2000 px) en un PDF prêt pour l'OCR côté serveur. */
suspend fun buildPdf(context: Context, pages: List<ScannedPage>): File = withContext(Dispatchers.IO) {
    val pdf = PdfDocument()
    pages.forEachIndexed { i, p ->
        val opts = BitmapFactory.Options().apply { inSampleSize = 1 }
        var bmp = BitmapFactory.decodeFile(p.file.absolutePath, opts) ?: return@forEachIndexed
        val scale = minOf(1f, 2000f / maxOf(bmp.width, bmp.height))
        val m = Matrix().apply { postScale(scale, scale); postRotate(p.rotation.toFloat()) }
        bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        val page = pdf.startPage(PdfDocument.PageInfo.Builder(bmp.width, bmp.height, i + 1).create())
        page.canvas.drawBitmap(bmp, 0f, 0f, null)
        pdf.finishPage(page)
        bmp.recycle()
    }
    val out = File(File(context.cacheDir, "scans").apply { mkdirs() }, "scan-${UUID.randomUUID()}.pdf")
    out.outputStream().use { pdf.writeTo(it) }
    pdf.close()
    out
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScannerScreen(initialCourseId: String?, initialFolderId: String?, onBack: () -> Unit, onDone: (String) -> Unit) {
    val c = container()
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val online by c.isOnline.collectAsState()
    val courses by c.study.courses().collectAsState(emptyList())
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    val pages = remember { mutableStateListOf<ScannedPage>() }
    val capture = remember { ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build() }
    var courseId by remember { mutableStateOf(initialCourseId) }
    var folderId by remember { mutableStateOf(initialFolderId) }
    var menu by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val name = remember { "Scan du " + SimpleDateFormat("dd/MM/yyyy HH'h'mm", Locale.FRENCH).format(Date()) }

    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }

    Column(Modifier.fillMaxSize()) {
        BackBar("Scanner un document", onBack)
        if (!granted) {
            Column(Modifier.padding(16.dp)) {
                Notice("L’accès à la caméra est nécessaire pour numériser vos documents.")
                SecondaryButton("Autoriser la caméra", { permission.launch(Manifest.permission.CAMERA) })
            }
            return@Column
        }
        Box(Modifier.fillMaxWidth().weight(1f).background(SM.Charcoal)) {
            AndroidView(factory = { ctx ->
                PreviewView(ctx).also { view ->
                    val future = ProcessCameraProvider.getInstance(ctx)
                    future.addListener({
                        val provider = future.get()
                        val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
                        provider.unbindAll()
                        provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
                    }, ContextCompat.getMainExecutor(ctx))
                }
            }, modifier = Modifier.fillMaxSize())
            IconButton(
                onClick = {
                    val file = File(File(context.cacheDir, "scans").apply { mkdirs() }, "page-${UUID.randomUUID()}.jpg")
                    capture.takePicture(ImageCapture.OutputFileOptions.Builder(file).build(), ContextCompat.getMainExecutor(context), object : ImageCapture.OnImageSavedCallback {
                        override fun onImageSaved(result: ImageCapture.OutputFileResults) { pages += ScannedPage(file) }
                        override fun onError(e: ImageCaptureException) { error = "La photo n’a pas pu être prise." }
                    })
                },
                modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp).size(68.dp).background(SM.White, CircleShape),
            ) { Icon(Icons.Outlined.PhotoCamera, "Prendre la page en photo", tint = SM.Crimson, modifier = Modifier.size(30.dp)) }
        }
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("${pages.size} page(s)", style = MaterialTheme.typography.titleSmall)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(pages) { i, p ->
                    val bmp = remember(p.file) { BitmapFactory.decodeFile(p.file.absolutePath, BitmapFactory.Options().apply { inSampleSize = 8 }) }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        bmp?.let { Image(it.asImageBitmap(), "Page ${i + 1}", Modifier.size(64.dp, 84.dp).rotate(p.rotation.toFloat())) }
                        Row {
                            IconButton(onClick = { pages[i] = p.copy(rotation = (p.rotation + 90) % 360) }, Modifier.size(32.dp)) { Icon(Icons.Outlined.RotateRight, "Pivoter la page ${i + 1}", Modifier.size(18.dp)) }
                            IconButton(onClick = { pages.removeAt(i) }, Modifier.size(32.dp)) { Icon(Icons.Outlined.Close, "Retirer la page ${i + 1}", Modifier.size(18.dp)) }
                        }
                    }
                }
            }
            ExposedDropdownMenuBox(expanded = menu, onExpandedChange = { menu = it }) {
                OutlinedTextField(
                    courses.find { it.id == courseId }?.title ?: "Choisir un dossier…", {}, readOnly = true, label = { Text("Dossier (obligatoire)") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(menu) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
                )
                ExposedDropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    courses.forEach { co -> DropdownMenuItem(text = { Text(co.title) }, onClick = { if (co.id != courseId) folderId = null; courseId = co.id; menu = false }) }
                }
            }
            error?.let { ErrorState(it) }
            if (!online) Notice("L’envoi et la reconnaissance du texte (OCR) nécessitent une connexion.")
            PrimaryButton("Enregistrer le scan", {
                busy = true; error = null
                scope.launch {
                    try {
                        runCatching { c.sync.sync() } // le dossier doit exister sur le serveur
                        val pdf = buildPdf(context, pages.toList())
                        val id = c.documents.uploadPdf(pdf, "$name.pdf", courseId!!, folderId, source = "scan")
                        pdf.delete(); pages.forEach { it.file.delete() }
                        onDone(id)
                    } catch (e: Exception) { error = e.toUserMessage() } finally { busy = false }
                }
            }, Modifier.fillMaxWidth().height(48.dp), loading = busy, enabled = pages.isNotEmpty() && online && courseId != null)
            if (courses.isEmpty()) Notice("Créez d’abord un dossier (onglet Dossiers) : chaque document appartient à un dossier.")
        }
    }
}
