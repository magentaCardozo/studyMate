plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

val apiUrl = (project.findProperty("studymate.apiUrl") as String?) ?: "http://10.0.2.2:4000/"

android {
    namespace = "com.studymateai"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.studymateai"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        // Aucune clé d'IA ni secret n'est embarqué : seule l'URL publique de l'API.
        buildConfigField("String", "API_BASE_URL", "\"$apiUrl\"")
        resourceConfigurations += listOf("fr", "en")
    }

    buildTypes {
        debug {
            // Le trafic en clair n'est autorisé que vers l'émulateur/hôte local (network_security_config).
            manifestPlaceholders["networkConfig"] = "@xml/network_security_config_debug"
        }
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            manifestPlaceholders["networkConfig"] = "@xml/network_security_config"
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.work.runtime)
    implementation(libs.datastore.preferences)
    implementation(libs.retrofit)
    implementation(libs.retrofit.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    testImplementation(libs.junit)
}
