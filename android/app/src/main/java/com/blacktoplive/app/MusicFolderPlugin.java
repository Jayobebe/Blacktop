package com.blacktoplive.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/**
 * Blacktop Radio's folder picker. The web app picks a folder with the browser's
 * own directory picker, which the app's web view doesn't have (choosing a
 * folder there did nothing). This opens Android's folder chooser, keeps the
 * permission to read that folder for good, and answers with the audio files
 * directly inside it: their names and the addresses the radio plays them from
 * (through Capacitor's content server, so nothing is copied).
 */
@CapacitorPlugin(name = "MusicFolder")
public class MusicFolderPlugin extends Plugin {

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            startActivityForResult(call, intent, "picked");
        } catch (Exception e) {
            call.reject("No folder picker on this phone", e);
        }
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        JSObject answer = new JSObject();
        JSArray tracks = new JSArray();
        Intent data = result.getData();
        Uri tree = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || tree == null) {
            answer.put("tracks", tracks);
            answer.put("cancelled", true);
            call.resolve(answer);
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        try {
            // So the station still plays after the app has been closed.
            resolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {
            // Some folders (a cloud drive's) can't be kept: it plays until the app is closed.
        }
        try {
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            String[] columns = {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE
            };
            try (Cursor cursor = resolver.query(children, columns, null, null, null)) {
                while (cursor != null && cursor.moveToNext()) {
                    String id = cursor.getString(0);
                    String name = cursor.getString(1);
                    String mime = cursor.getString(2);
                    if (id == null || name == null || DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                        continue;
                    }
                    boolean audio = (mime != null && mime.startsWith("audio/"))
                        || name.toLowerCase(Locale.ROOT).matches(".*\\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm)$");
                    if (!audio) {
                        continue;
                    }
                    JSObject track = new JSObject();
                    track.put("name", name);
                    track.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                    tracks.put(track);
                }
            }
        } catch (Exception e) {
            call.reject("Could not read that folder", e);
            return;
        }
        answer.put("tracks", tracks);
        answer.put("cancelled", false);
        call.resolve(answer);
    }
}
