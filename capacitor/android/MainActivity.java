package com.myanmarofflineai.myk;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MykModelPlugin.class);
        registerPlugin(MykAIPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
