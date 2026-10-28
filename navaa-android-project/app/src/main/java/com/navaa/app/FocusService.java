package com.navaa.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class FocusService extends Service {
    static volatile String phase = "idle";   // idle | focus | paused | break
    static volatile boolean breakUsed = false;
    static volatile boolean alive = false;
    static volatile int mins = 0;

    // Apps that trigger the popup during a focus session. Add more package names here.
    static final Set<String> APPS = new HashSet<>(Arrays.asList(
        "com.instagram.android", "com.instagram.barcelona", "com.zhiliaoapp.musically",
        "com.ss.android.ugc.trill", "com.google.android.youtube", "com.snapchat.android",
        "com.twitter.android", "com.facebook.katana", "com.reddit.frontpage"));

    private final Handler h = new Handler(Looper.getMainLooper());
    private WindowManager wm;
    private FrameLayout overlay;
    private TextView body;
    private Button brk;
    private boolean shown = false;
    private String top = "";
    private final Runnable poll = new Runnable() {
        @Override public void run() { check(); h.postDelayed(this, 1000); }
    };

    @Override public void onCreate() {
        super.onCreate();
        alive = true;
        wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationChannel c = new NotificationChannel("focus", "Focus session", NotificationManager.IMPORTANCE_LOW);
        getSystemService(NotificationManager.class).createNotificationChannel(c);
        Notification n = new Notification.Builder(this, "focus")
            .setContentTitle("NAVAA focus session")
            .setContentText("Watching for distractions")
            .setSmallIcon(android.R.drawable.ic_dialog_info).build();
        startForeground(1, n);
        h.removeCallbacks(poll);
        h.post(poll);
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        alive = false;
        h.removeCallbacks(poll);
        hide();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent i) { return null; }

    private void check() {
        String p = foreground();
        if (p != null) top = p;
        if (phase.equals("focus") && APPS.contains(top)) show(); else hide();
    }

    private String foreground() {
        try {
            UsageStatsManager u = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
            long now = System.currentTimeMillis();
            UsageEvents e = u.queryEvents(now - 5000, now);
            UsageEvents.Event ev = new UsageEvents.Event();
            String r = null;
            while (e != null && e.hasNextEvent()) {
                e.getNextEvent(ev);
                if (ev.getEventType() == 1) r = ev.getPackageName(); // app came to the front
            }
            return r;
        } catch (Exception x) { return null; }
    }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }

    private TextView text(String s, int size, int color) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(size); t.setTextColor(color);
        return t;
    }

    private Button button(String s, int bg, int fg) {
        Button b = new Button(this);
        b.setText(s); b.setAllCaps(false); b.setTextColor(fg);
        GradientDrawable g = new GradientDrawable();
        g.setColor(bg); g.setCornerRadius(dp(12));
        b.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(48));
        lp.topMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private void build() {
        overlay = new FrameLayout(this);
        overlay.setBackgroundColor(0xE614152B);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(26), dp(26), dp(26), dp(26));
        GradientDrawable g = new GradientDrawable();
        g.setColor(0xFF1D1E3B); g.setCornerRadius(dp(20));
        box.setBackground(g);
        TextView title = text("Hold on — you're mid-focus", 20, 0xFFF7F5F0);
        title.setTypeface(null, Typeface.BOLD);
        body = text("", 14, 0xFF9296AC);
        body.setPadding(0, dp(10), 0, dp(14));
        Button go = button("Go back", 0xFFFF8A3D, 0xFF14152B);
        brk = button("Take a break", 0xFF262848, 0xFFF7F5F0);
        go.setOnClickListener(v -> {
            top = getPackageName();
            hide();
            Intent i = new Intent(this, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
        });
        brk.setOnClickListener(v -> {
            if (breakUsed) return;
            phase = "break"; breakUsed = true;
            hide();
            if (MainActivity.web != null) MainActivity.web.post(() ->
                MainActivity.web.evaluateJavascript("window.navaaTakeBreak && navaaTakeBreak()", null));
        });
        box.addView(title); box.addView(body); box.addView(go); box.addView(brk);
        FrameLayout.LayoutParams bp = new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER);
        bp.leftMargin = dp(24); bp.rightMargin = dp(24);
        overlay.addView(box, bp);
    }

    private void show() {
        if (overlay == null) build();
        int m = Math.max(1, mins);
        body.setText("You're " + m + " minute" + (m == 1 ? "" : "s") + " into a focus session. Opening this now usually turns into 40 minutes gone.");
        brk.setEnabled(!breakUsed);
        brk.setText(breakUsed ? "Break already used" : "Take a break");
        if (shown) return;
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(-1, -1,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT);
        try { wm.addView(overlay, lp); shown = true; } catch (Exception e) { }
    }

    private void hide() {
        if (!shown) return;
        try { wm.removeView(overlay); } catch (Exception e) { }
        shown = false;
    }
}
