if(NOT TARGET hermes-engine::hermesvm)
add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_LOCATION "C:/Users/lucca/.gradle/caches/8.13/transforms/a14ec288526ee511369f3f73751d1414/transformed/hermes-android-0.14.0-release/prefab/modules/hermesvm/libs/android.armeabi-v7a/libhermesvm.so"
    INTERFACE_INCLUDE_DIRECTORIES "C:/Users/lucca/.gradle/caches/8.13/transforms/a14ec288526ee511369f3f73751d1414/transformed/hermes-android-0.14.0-release/prefab/modules/hermesvm/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

