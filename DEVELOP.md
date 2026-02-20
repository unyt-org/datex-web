# Development Guide

## Building the library

The rust adapter code can be found in the [`rs-lib`](./rs-lib/) directory, the
generated WASM and JS glue code in the [`src/datex-web`](./src/datex-web/)
directory.

This project has a strong dependency on
[DATEX](https://github.com/unyt-org/datex.git) (see
[Cargo.toml](./rs-lib/Cargo.toml)).

To generate a WASM binary and JS glue code, run the following command:

```sh
deno task release
```

To generate a debug build, run:

```sh
deno task debug
```

Note that the project is built with **Rust Nightly**
([`rustc 1.95.0-nightly`](https://releases.rs/docs/1.95.0/))

---

If you want to build the library with a local version of the
[`datex`](https://github.com/unyt-org/datex) crate, you can override the
dependency in a `.cargo/config.toml` file in the project root like this:

```toml
[patch."https://github.com/unyt-org/datex"]
datex-core = { 
    path = "../datex/crates/datex-core", # the path to your local datex clone
    default-features = false, 
    features = [
        ...
    ]
}
```

## Running tests

The JS build can be tested by running `deno task test`. This compiles the
library, generates the WASM binary and JS glue code, and runs all tests in the
[`test`](./test/) directory. If you only want to run the tests without
rebuilding the rust library, you can run `deno task test-no-build`.

## Browser testing

You can test the library in the browser by running `deno task serve`. This will
spin up a web server at `http://localhost:8042/test/browser.html` in your
browser. A new runtime instance is automatically created and can be accessed in
the developer console via the global `Datex` variable.

## Creating a new release

**Important steps before creating a release**:

- Run `deno task release` to ensure that the generated d.ts files contain the
  types for the release build.
- Set the `datex` crate to the correct version in the `Cargo.toml` file.
