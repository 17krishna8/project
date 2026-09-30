/// <reference types="vite/client" />

/** Injected into the served index.html by the mock server (see core's /__ui). */
declare const __MOCKFORGE_SPEC__: { title: string; version: string; routes: number } | undefined;
