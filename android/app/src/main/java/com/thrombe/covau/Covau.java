package com.thrombe.covau;

public class Covau {
    private static native String serve(String dataDir);

    static {
        // This actually loads the shared object that we'll be creating.
        // The actual location of the .so or .dll may differ based on your
        // platform.
        System.loadLibrary("covaulib");
    }

    public static void start(String dataDir) {
        System.out.println("starting server from java");
        String str = Covau.serve(dataDir);
        System.out.println(str);
    }

}