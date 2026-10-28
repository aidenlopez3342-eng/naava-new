package com.navaa.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Process;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    // Your NAVAA website. Change this if your Netlify link is different.
    static final String URL = "https://inquisitive-hamster-yfc.netlify.app";
    static WebView web;
    private AlertDialog dialog;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(0xFF14152B);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);
        web.loadUrl(URL);
    }

    @Override protected void onResume() {
        super.onResume();
        if (dialog != null && dialog.isShowing()) return;
        if (!Settings.canDrawOverlays(this)) {
            ask("Allow NAVAA to display over other apps, so it can remind you when you open Instagram mid-focus.",
                new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } else if (!hasUsageAccess()) {
            ask("Allow usage access, so NAVAA can tell when you open Instagram or other distracting apps. Find NAVAA in the list and turn it on.",
                new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + getPackageName())));
        }
    }

    private void ask(String msg, Intent i) {
        dialog = new AlertDialog.Builder(this)
            .setTitle("Permission needed")
            .setMessage(msg)
            .setPositiveButton("Open settings", (d, w) -> startActivity(i))
            .setNegativeButton("Later", null)
            .show();
    }

    private boolean hasUsageAccess() {
        AppOpsManager a = (AppOpsManager) getSystemService(Context.APP_OPS_SERVICE);
        int m = a.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getPackageName());
        return m == AppOpsManager.MODE_ALLOWED;
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    // The NAVAA website calls this to tell the phone what the focus timer is doing.
    class Bridge {
        @JavascriptInterface public void setState(String phase, boolean breakUsed, int mins) {
            FocusService.phase = phase;
            FocusService.breakUsed = breakUsed;
            FocusService.mins = mins;
            boolean active = !phase.equals("idle");
            Intent i = new Intent(MainActivity.this, FocusService.class);
            try {
                if (active && !FocusService.alive) startForegroundService(i);
                else if (!active && FocusService.alive) stopService(i);
            } catch (Exception e) { }
        }
    }
}
