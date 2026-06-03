package com.milacoach.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String PREFS_NAME = "MilaCoachCookies";
    private static final String COOKIE_KEY = "backend_token_cookie";
    private static final String DOMAIN = "https://www.mila-coach.com";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);

        // Gespeicherten Token aus SharedPreferences wiederherstellen
        String saved = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .getString(COOKIE_KEY, null);
        if (saved != null && !saved.isEmpty()) {
            cm.setCookie(DOMAIN,
                saved + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000");
            cm.flush();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        CookieManager cm = CookieManager.getInstance();
        cm.flush();

        // backend_token aus den Cookies lesen und in SharedPreferences sichern
        String cookies = cm.getCookie(DOMAIN);
        if (cookies != null) {
            for (String cookie : cookies.split(";")) {
                String trimmed = cookie.trim();
                if (trimmed.startsWith("backend_token=")) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit()
                        .putString(COOKIE_KEY, trimmed)
                        .apply();
                    break;
                }
            }
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        CookieManager.getInstance().flush();
    }
}
