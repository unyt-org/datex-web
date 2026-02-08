# TODO

- [x] use `log` and `defmt` for logging (instead of own implementation)
- [x] smaller binary size: https://github.com/johnthagen/min-sized-rust
  - We can shrink from 2.6MB to 2MB
    (`wasm-opt' -Oz datex_web_js.wasm -o out.wasm`)
- [x] parsing of dxb_body could maybe be simplified by using a serialization
      library
- [x] `anyhow` should not be used in library crates (create enums for errors
      instead)
- [?] crate should be no_std (for wasm and embedded)
  - current dependencies:
    - pad
    - tokio
    - websockets
- [x] create a trait for everything that is platform-specific (e.g. websockets)
      put the implementations of the traits behind feature flags (or in a
      seperate crate) features should be additive
- [x] `lazy_static` can be replaced by `core::cell::LazyCell` and
      `once_cell::sync::LazyLock`
- [ ] `static`s should be avoided (GlobalContext)
- [ ] generally generics should be preferred over dynamic dispatch (e.g. in
      network::com_hub::ComHub)
- [ ] ~~don't use the nightly `coroutines` feature as it won't be stabilized in
      the near future~~
- [ ] getter methods should be split into a non-mut and a mut version (e.g.
      Memory::get_pointer_by_*)
- [ ] use a slice instead of array or Vec as parameter type if possible (e.g.
      Memory::get_pointer_by_id)
- [ ] integrate clippy

---

- [ ] naming conventions: https://rust-lang.github.io/api-guidelines/naming.html
      (e.g.
- [ ] DXBBlock => DxbBlock, no `get_*` functions)
- [ ] `mopa` crate is unmaintained
