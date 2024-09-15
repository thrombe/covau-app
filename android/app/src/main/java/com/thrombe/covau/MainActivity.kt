package com.thrombe.covau

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val thread = Thread {
            Covau.start(this.applicationInfo.dataDir)
        }
        thread.start()

        // TODO: do this edge to edge thing. i.e, render behind the status bar and the navigation bar.
        // somehow need to reserve space for both in html
        // enableEdgeToEdge()
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    WebViewScreen()
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebViewScreen() {
    val context = LocalContext.current
    // TODO: fetch this url from rust.
    val url = "http://localhost:6176/#/local"
    // val url = "https://covau.netlify.app/"
    // val url = "https://youtube.com/"

    AndroidView(
        factory = {
            WebView(context).apply {
                webViewClient = WebViewClient() // Handle loading URLs
                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(message: String, lineNumber: Int, sourceID: String) {
                        Log.d("WebViewConsole", "$message -- From line $lineNumber of $sourceID")
                    }
                }

                settings.javaScriptEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                loadUrl(url)
            }
        },
        update = { webView ->
            webView.loadUrl(url)
        },
    )
}
