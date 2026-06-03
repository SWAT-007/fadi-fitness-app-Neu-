package com.milacoach.app;

import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        CookieManager.getInstance().setAcceptCookie(true);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Persist cookies to disk so the login survives a cold app restart.
        CookieManager.getInstance().flush();
    }
}
