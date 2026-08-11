package com.mchvoicecare.mch_voicecare_mobile.ocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import org.json.JSONObject

/**
 * OCR native module — on-device text recognition (spec §16).
 *
 * Provides on-device OCR using ML Kit Text Recognition v2 as a lightweight,
 * dependency-free alternative to PP-OCRv5. ML Kit runs entirely on-device,
 * supports Latin script (including handwritten numbers common in MCH
 * record books), and requires no network connection.
 *
 * For full PP-OCRv5 integration (multilingual + handwriting), the
 * PaddleLite C++ library can be loaded via JNI. This module exposes
 * the same JS interface so the underlying engine can be swapped without
 * changing the React Native layer.
 *
 * Safety (spec §16.3): all extracted fields are returned with a
 * confidence score. Safety-critical fields MUST be human-confirmed
 * regardless of confidence (handled in the JS layer / OCRConfirmScreen).
 */
@ReactModule(name = OcrModule.NAME)
class OcrModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "OcrModule"
    }

    override fun getName(): String = NAME

    /**
     * Recognize text from a base64-encoded image.
     *
     * @param imageBase64  Base64-encoded JPEG/PNG image (no data: prefix)
     * @param templateId   Document template ID (for field-aware extraction)
     * @param promise      Resolves with { text, fields, confidence, engine }
     *
     * Returns:
     *   text:       full recognized text string
     *   fields:     array of { key, value, confidence, bbox }
     *   confidence: overall confidence (0.0–1.0)
     *   engine:     "mlkit" | "tesseract" | "paddle" | "none"
     */
    @ReactMethod
    fun recognizeText(imageBase64: String, templateId: String, promise: Promise) {
        try {
            val decodedBytes = Base64.decode(imageBase64, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)

            if (bitmap == null) {
                promise.resolve(createResult("", emptyArray(), 0.0, "none", "Failed to decode image"))
                return
            }

            // Try ML Kit Text Recognition (if available via classpath)
            val mlKitResult = tryMlKitRecognition(bitmap)
            if (mlKitResult != null) {
                promise.resolve(mlKitResult)
                return
            }

            // Fallback: basic heuristic extraction (no ML engine available)
            // This returns empty fields — the JS layer will fall back to
            // server-side OCR or manual entry (spec §10.2).
            promise.resolve(createResult("", emptyArray(), 0.0, "none", "No OCR engine available on device"))

        } catch (e: Exception) {
            promise.resolve(createResult("", emptyArray(), 0.0, "none", e.message ?: "OCR error"))
        }
    }

    /**
     * Check if on-device OCR is available.
     *
     * @param promise Resolves with { available: boolean, engine: string }
     */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        val engine = detectEngine()
        val available = engine != "none"
        val map = Arguments.createMap()
        map.putBoolean("available", available)
        map.putString("engine", engine)
        promise.resolve(map)
    }

    /**
     * Detect which OCR engine is available on the device.
     */
    private fun detectEngine(): String {
        // Check ML Kit
        try {
            Class.forName("com.google.mlkit.vision.text.TextRecognition")
            Class.forName("com.google.mlkit.vision.text.latin.TextRecognizerOptions")
            return "mlkit"
        } catch (e: ClassNotFoundException) {
            // ML Kit not linked
        }

        // Check Tesseract (tess-two)
        try {
            Class.forName("com.googlecode.tesseract.android.TessBaseAPI")
            return "tesseract"
        } catch (e: ClassNotFoundException) {
            // Tesseract not linked
        }

        // Check PaddleLite
        try {
            Class.forName("com.baidu.paddle.lite.PaddlePredictor")
            return "paddle"
        } catch (e: ClassNotFoundException) {
            // PaddleLite not linked
        }

        return "none"
    }

    /**
     * Attempt ML Kit text recognition.
     * Returns null if ML Kit is not available.
     */
    private fun tryMlKitRecognition(bitmap: Bitmap): ReadableMap? {
        try {
            val textRecognitionClass = Class.forName("com.google.mlkit.vision.text.TextRecognition")
            val optionsClass = Class.forName("com.google.mlkit.vision.text.latin.TextRecognizerOptions")
            val options = optionsClass.getDeclaredField("DEFAULT_OPTIONS").get(null)

            // textRecognition.getClient(options)
            val getClientMethod = textRecognitionClass.getMethod("getClient", optionsClass)
            val client = getClientMethod.invoke(null, options)

            // Create InputImage from bitmap
            val inputImageClass = Class.forName("com.google.mlkit.vision.common.InputImage")
            val fromBitmapMethod = inputImageClass.getMethod("fromBitmap", Bitmap::class.java, Int::class.javaPrimitiveType)
            val inputImage = fromBitmapMethod.invoke(null, bitmap, 0)

            // client.process(inputImage)
            val processMethod = client.javaClass.getMethod("process", Class.forName("com.google.mlkit.vision.common.InputImage"))
            @Suppress("UNCHECKED_CAST")
            val task = processMethod.invoke(client, inputImage) as com.google.android.gms.tasks.Task<Any>

            // Block on the task (synchronous — called from JS thread)
            val result = com.google.android.gms.tasks.Tasks.await(task)

            // Extract text from result
            val getTextMethod = result.javaClass.getMethod("getText")
            val text = getTextMethod.invoke(result) as String

            // Extract text blocks for field-level confidence
            val getBlocksMethod = result.javaClass.getMethod("getTextBlocks")
            @Suppress("UNCHECKED_CAST")
            val blocks = getBlocksMethod.invoke(result) as List<Any>

            val fields = mutableListOf<FieldResult>()
            for (block in blocks) {
                val blockTextMethod = block.javaClass.getMethod("getText")
                val blockText = blockTextMethod.invoke(block) as String
                val cornerPointsMethod = block.javaClass.getMethod("getCornerPoints")
                val corners = cornerPointsMethod.invoke(block) as Array<*>

                fields.add(FieldResult(
                    key = "block_${fields.size}",
                    value = blockText.trim(),
                    confidence = 0.85, // ML Kit doesn't provide per-block confidence
                    bbox = corners?.map { "${(it as? android.graphics.Point)?.x},${(it as? android.graphics.Point)?.y}" } ?: emptyList()
                ))
            }

            return createResult(text, fields.toTypedArray(), 0.85, "mlkit", null)

        } catch (e: Exception) {
            // ML Kit not available or failed
            return null
        }
    }

    /**
     * Create a React Native WritableMap result.
     */
    private fun createResult(
        text: String,
        fields: Array<FieldResult>,
        confidence: Double,
        engine: String,
        error: String?
    ): ReadableMap {
        val map = Arguments.createMap()
        map.putString("text", text)
        map.putString("engine", engine)
        map.putDouble("confidence", confidence)

        val fieldsArray = Arguments.createArray()
        for (field in fields) {
            val fieldMap = Arguments.createMap()
            fieldMap.putString("key", field.key)
            fieldMap.putString("value", field.value)
            fieldMap.putDouble("confidence", field.confidence)
            val bboxArray = Arguments.createArray()
            for (bp in field.bbox) {
                bboxArray.pushString(bp)
            }
            fieldMap.putArray("bbox", bboxArray)
            fieldsArray.pushMap(fieldMap)
        }
        map.putArray("fields", fieldsArray)

        if (error != null) {
            map.putString("error", error)
        }
        return map
    }

    private data class FieldResult(
        val key: String,
        val value: String,
        val confidence: Double,
        val bbox: List<String>
    )
}
