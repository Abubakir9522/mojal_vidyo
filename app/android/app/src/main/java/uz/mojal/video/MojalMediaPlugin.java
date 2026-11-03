package uz.mojal.video;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Writes finished videos to the phone's gallery in chunks, and hands them to the system share sheet. */
@CapacitorPlugin(name = "MojalMedia")
public class MojalMediaPlugin extends Plugin {

    private static final String FOLDER = "Mojal Video";

    private static final class Session {
        OutputStream out;
        Uri uri;
        File file;
        String mime;
    }

    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    @PluginMethod
    public void begin(PluginCall call) {
        String name = call.getString("name", "video.mp4");
        String mime = call.getString("mime", "video/mp4");
        Session s = new Session();
        s.mime = mime;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/" + FOLDER);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                s.uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
                if (s.uri == null) {
                    call.reject("Galereyada fayl yaratib bo'lmadi");
                    return;
                }
                s.out = resolver.openOutputStream(s.uri);
            } else {
                // Android 9 and older: the app's own Movies folder needs no storage permission, and the scanner lists it.
                File dir = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_MOVIES), FOLDER);
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("Papka yaratib bo'lmadi");
                    return;
                }
                s.file = new File(dir, name);
                s.out = new FileOutputStream(s.file);
            }
            if (s.out == null) {
                call.reject("Faylni ochib bo'lmadi");
                return;
            }
            String id = UUID.randomUUID().toString();
            sessions.put(id, s);
            JSObject ret = new JSObject();
            ret.put("id", id);
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Faylni ochib bo'lmadi: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void append(PluginCall call) {
        Session s = sessions.get(call.getString("id", ""));
        String data = call.getString("data");
        if (s == null || data == null) {
            call.reject("Saqlash boshlanmagan");
            return;
        }
        try {
            s.out.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Yozib bo'lmadi. Telefon xotirasini tekshiring: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        Session s = sessions.remove(call.getString("id", ""));
        if (s == null) {
            call.reject("Saqlash boshlanmagan");
            return;
        }
        try {
            s.out.flush();
            s.out.close();
            Uri result = s.uri;
            if (s.uri != null) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(s.uri, done, null, null);
            } else {
                MediaScannerConnection.scanFile(getContext(), new String[] { s.file.getAbsolutePath() }, new String[] { s.mime }, null);
                result = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", s.file);
            }
            JSObject ret = new JSObject();
            ret.put("uri", result.toString());
            call.resolve(ret);
        } catch (IOException e) {
            cleanup(s);
            call.reject("Saqlab bo'lmadi: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void abort(PluginCall call) {
        Session s = sessions.remove(call.getString("id", ""));
        if (s != null) cleanup(s);
        call.resolve();
    }

    private void cleanup(Session s) {
        try {
            s.out.close();
        } catch (IOException ignored) {
            // The stream is being thrown away anyway.
        }
        if (s.uri != null) getContext().getContentResolver().delete(s.uri, null, null);
        if (s.file != null) s.file.delete();
    }

    @PluginMethod
    public void share(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("Fayl ko'rsatilmagan");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(call.getString("mime", "video/mp4"));
        send.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(Intent.createChooser(send, "Ulashish"));
        call.resolve();
    }

    @PluginMethod
    public void open(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("Fayl ko'rsatilmagan");
            return;
        }
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(Uri.parse(uri), call.getString("mime", "video/mp4"));
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(view);
        call.resolve();
    }
}
