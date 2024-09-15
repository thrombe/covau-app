package com.thrombe.covau

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.thrombe.covau.ui.theme.CovauTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val thread = Thread {
            println("${Thread.currentThread().name} has run.")
            Covau.start(this.applicationInfo.dataDir)
        }
        thread.start()

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    WebViewScreen()
                }
            }
        }

//        enableEdgeToEdge()
//        setContent {
//            CovauTheme {
//                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
//                    Greeting(
//                        name = "Android",
//                        modifier = Modifier.padding(innerPadding)
//                    )
//                }
//            }
//        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebViewScreen() {
    val context = LocalContext.current
    // TODO: fetch this url from rust.
    val url = "http://localhost:6176/#/local"
//    val url = "https://covau.netlify.app/"
//    val url = "https://youtube.com/"
//    val url = "chrome://inspect/"

    // Create a WebView inside the AndroidView composable
    AndroidView(
        factory = {
            WebView(context).apply {
                webViewClient = WebViewClient() // Handle loading URLs
                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(message: String, lineNumber: Int, sourceID: String) {
                        Log.d("WebViewConsole", "$message -- From line $lineNumber of $sourceID")
                    }
                }

                settings.javaScriptEnabled = true // Enable JavaScript if needed
                settings.allowContentAccess = true
                settings.blockNetworkImage = false
                settings.blockNetworkLoads = false
                settings.safeBrowsingEnabled = false
                settings.allowFileAccess = true
                settings.allowUniversalAccessFromFileURLs = true
                settings.allowFileAccessFromFileURLs = true
                settings.userAgentString = "${settings.userAgentString} wasm"
                loadUrl(url) // Load the specified URL
            }
        },
        update = { webview ->
            webview.loadUrl(url) // Load the URL when the view is updated


            val htmlContent = """
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            html, body {
                                margin: 0;
                                padding: 0;
                                height: 100vh;
                                width: 100vw;
                            }
                        </style>
                    </head>
                    <body>
                        <div style="height: 100%; background-color: lightgreen;">This is a WebView!</div>
                    </body>
                        <script>
                            //setTimeout(() => {
                            console.log(window.innerHeight);
                            let el = document.getElementsByTagName('body')[0];
                            //el.style.height = `${'$'}{window.innerHeight}px`;
                            //}, 2000)
                        </script>
                    </html>
                """.trimIndent()

//            webview.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)

            // Inject JavaScript to set the height of the WebView based on content
//            webview.evaluateJavascript(
//                """
//                (function() {
//                    console.log(window.innerHeight);
//                    var height = document.body.scrollHeight;
//                     Android.setWebViewHeight(height);
//                     var el = document.getElementsByTagName('body')[0];
//                     el.style.height = "${'$'}{Dimensions.get('window').height}px';
//                })();
//                """.trimIndent(),
//                null
//            )

        },
//        modifier = Modifier.fillMaxSize()
//        modifier = Modifier.size(30.dp)
    )
}

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
    Text(
        text = "Hello $name!",
        modifier = modifier
    )
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    CovauTheme {
        Greeting("Android")
    }
}