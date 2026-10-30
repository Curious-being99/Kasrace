package com.kasrace.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.rgb(11, 15, 25));
        getWindow().setNavigationBarColor(Color.rgb(11, 15, 25));
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
                .setAppearanceLightStatusBars(false);

        View content = findViewById(android.R.id.content);
        if (content != null) {
            final int initialLeft = content.getPaddingLeft();
            final int initialTop = content.getPaddingTop();
            final int initialRight = content.getPaddingRight();
            final int initialBottom = content.getPaddingBottom();

            ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
                Insets insets = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars()
                                | WindowInsetsCompat.Type.displayCutout()
                );
                view.setPadding(
                        initialLeft + insets.left,
                        initialTop + insets.top,
                        initialRight + insets.right,
                        initialBottom + insets.bottom
                );
                return windowInsets;
            });
            ViewCompat.requestApplyInsets(content);
        }
    }
}
