// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    id("org.mozilla.rust-android-gradle.rust-android") version "0.9.4" apply false
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.jetbrains.kotlin.android) apply false
}