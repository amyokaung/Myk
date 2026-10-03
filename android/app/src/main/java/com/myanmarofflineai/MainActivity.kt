package com.myanmarofflineai

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = TextView(this).apply {
            text = "Myk native diagnostic OK\\n\\nAndroid Activity started successfully.\\nReact Native is intentionally NOT started."
            textSize = 20f
            setPadding(48, 48, 48, 48)
        }
        setContentView(text)
    }
}
