package com.sajra.familytree;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/**
 * The chat's voice input previously relied on the Web Speech API's SpeechRecognition inside the
 * WebView - that API is unreliable-to-absent in Android's embedded WebView runtime (unlike actual
 * Chrome), unlike speechSynthesis (text-to-speech), which the WebView handles fine on its own.
 * This wraps Android's own on-device/Google SpeechRecognizer - the same system used by the
 * keyboard's mic button and Google Assistant - and reports partial/final results and the live
 * input level as events, so the JS side can show a WhatsApp-style recording UI.
 */
@CapacitorPlugin(
    name = "AppSpeech",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") }
)
public class AppSpeechPlugin extends Plugin {
    private SpeechRecognizer recognizer;
    private String language = "en-US";
    private boolean shouldContinue = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicPermission");
            return;
        }
        beginListening(call);
    }

    @PermissionCallback
    private void onMicPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            beginListening(call);
        } else {
            call.reject("Microphone permission denied.");
        }
    }

    /** Resolves `call` once (listening has started); every result/error after this point only goes through notifyListeners. */
    private void beginListening(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognition is not available on this device.");
            return;
        }
        language = call.getString("language", "en-US");
        shouldContinue = true;
        getActivity().runOnUiThread(this::startRecognitionRound);
        call.resolve();
    }

    /** One round of listening. Android's recognizer always stops itself after a result or a silence timeout, so onResults/onError restart it to approximate continuous dictation until stop() is called. */
    private void startRecognitionRound() {
        if (!shouldContinue) return;
        if (recognizer != null) {
            recognizer.destroy();
        }
        recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}

            @Override public void onBeginningOfSpeech() {}

            @Override public void onRmsChanged(float rmsdB) {
                JSObject data = new JSObject();
                // Roughly maps the dB range SpeechRecognizer emits to 0..1 for the UI to scale with.
                data.put("level", Math.max(0, Math.min(1, (rmsdB + 2) / 12)));
                notifyListeners("speechLevel", data);
            }

            @Override public void onBufferReceived(byte[] buffer) {}

            @Override public void onEndOfSpeech() {}

            @Override public void onError(int error) {
                // No-speech/timeout are routine during pauses between sentences, not real failures -
                // restart silently so the mic doesn't visibly die after a couple of seconds; only
                // genuinely terminal errors are reported to JS, which would otherwise see a stream
                // of spurious "error" events during completely normal continuous listening.
                boolean recoverable = shouldContinue && (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT);
                if (recoverable) {
                    startRecognitionRound();
                    return;
                }
                shouldContinue = false;
                JSObject data = new JSObject();
                data.put("code", error);
                notifyListeners("speechError", data);
            }

            @Override public void onResults(Bundle results) {
                emitTranscript(results, true);
                if (shouldContinue) startRecognitionRound();
            }

            @Override public void onPartialResults(Bundle partialResults) {
                emitTranscript(partialResults, false);
            }

            @Override public void onEvent(int eventType, Bundle params) {}

            private void emitTranscript(Bundle bundle, boolean isFinal) {
                ArrayList<String> matches = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches == null || matches.isEmpty()) return;
                JSObject data = new JSObject();
                data.put("transcript", matches.get(0));
                data.put("isFinal", isFinal);
                notifyListeners("speechResult", data);
            }
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        recognizer.startListening(intent);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        shouldContinue = false;
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) {
                recognizer.stopListening();
                recognizer.destroy();
                recognizer = null;
            }
        });
        call.resolve();
    }
}
