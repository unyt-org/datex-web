use datex::libs::core::{CoreLibPointerId, create_core_lib};
use datex::values::pointer::PointerAddress;

#[test]
#[ignore]
/// Generates a TypeScript mapping of core type addresses to their names.
/// Run this test and copy the output into `src/dif/definitions.ts`.
///
/// `cargo test create_core_type_ts_mapping -- --show-output --ignored`
fn create_core_type_ts_mapping() {
    let core_lib = create_core_lib();
    let mut core_lib: Vec<(CoreLibPointerId, PointerAddress)> = core_lib
        .keys()
        .map(|key| (key.clone(), PointerAddress::from(key.clone())))
        .collect();
    core_lib.sort_by_key(|(key, _)| {
        PointerAddress::from(key.clone()).bytes().to_vec()
    });

    println!("export const CoreTypeAddress = {{");
    for (core_lib_id, address) in core_lib {
        println!(
            "    {}: \"{}\",",
            core_lib_id.to_string().replace("/", "_"),
            address.to_string().strip_prefix("$").unwrap()
        );
    }
    println!("}} as const;");
}
