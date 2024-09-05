plugins {
    id("org.mozilla.rust-android-gradle.rust-android")
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
}

android {
    namespace = "com.thrombe.covau"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.thrombe.covau"
        minSdk = 30
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.1"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    ndkVersion = "27.0.12077973"
    buildToolsVersion = "34.0.0"
}

dependencies {

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}

cargo {
    module = "../covaulib"
    libname = "covaulib"
    targets = listOf("arm64", "x86_64")
    targetIncludes = arrayOf("libcovaulib.so")
}

//tasks.preBuild.configure {
//    dependsOn.add(tasks.withType(com.nishtahir.CargoBuildTask::class.java))
//}
//afterEvaluate {
//    // The `cargoBuild` task isn't available until after evaluation.
//    android.applicationVariants.all { variant ->
//        def productFlavor = ""
//        variant.productFlavors.each {
//            productFlavor += "${it.name.capitalize()}"
//        }
//        def buildType = "${variant.buildType.name.capitalize()}"
//        tasks["generate${productFlavor}${buildType}Assets"].dependsOn(tasks["cargoBuild"])
//    }
//}

project.afterEvaluate {
    tasks.withType(com.nishtahir.CargoBuildTask::class).forEach { buildTask ->
        tasks.withType(com.android.build.gradle.tasks.MergeSourceSetFolders::class).configureEach {
            this.inputs.dir(
                layout.buildDirectory.dir("rustJniLibs" + File.separatorChar + buildTask.toolchain!!.folder)
            )
            this.dependsOn(buildTask)
        }
    }
}