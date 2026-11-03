package uz.mojal.video;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private ValueCallback<Uri[]> pendingFiles;
    private ActivityResultLauncher<Intent> filePicker;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MojalMediaPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() == null) return;

        filePicker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            ValueCallback<Uri[]> callback = pendingFiles;
            pendingFiles = null;
            if (callback == null) return;
            callback.onReceiveValue(result.getResultCode() == Activity.RESULT_OK ? urisFrom(result.getData()) : null);
        });

        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
                return openFiles(callback, params);
            }
        });
    }

    /**
     * Opens the system Files screen. Testing showed the newer photo picker can hand back
     * files the WebView cannot read, while documents opened this way read reliably.
     */
    private boolean openFiles(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (pendingFiles != null) pendingFiles.onReceiveValue(null);
        pendingFiles = callback;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        List<String> types = new ArrayList<>();
        boolean anything = false;
        for (String t : params.getAcceptTypes()) {
            for (String one : t.split(",")) {
                String type = one.trim();
                if (type.contains("/")) types.add(type);
                else if (!type.isEmpty()) anything = true;
            }
        }
        if (!anything && !types.isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try {
            filePicker.launch(intent);
            return true;
        } catch (Exception e) {
            pendingFiles = null;
            return false;
        }
    }

    private static Uri[] urisFrom(Intent data) {
        if (data == null) return null;
        ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            Uri[] out = new Uri[clip.getItemCount()];
            for (int i = 0; i < out.length; i++) out[i] = clip.getItemAt(i).getUri();
            return out;
        }
        return data.getData() != null ? new Uri[] { data.getData() } : null;
    }
}
