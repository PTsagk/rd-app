#!/usr/bin/env swift

import Cocoa
import ApplicationServices

// MARK: - AX Helper Functions

/// Get AX attribute value for an element
func getAXValue(_ element: AXUIElement, _ attribute: CFString) -> CFTypeRef? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute, &value)
    return result == .success ? value : nil
}

/// Safely convert CFTypeRef to AXValue
func axValue(_ value: CFTypeRef?, expectedType: AXValueType) -> AXValue? {
    guard let value = value else { return nil }
    guard CFGetTypeID(value) == AXValueGetTypeID() else { return nil }

    let axValue = unsafeBitCast(value, to: AXValue.self)
    // Check type matches (cgPoint or cgSize)
    guard AXValueGetType(axValue) == expectedType else { return nil }
    return axValue
}

/// Recursively print AX element tree
func printElement(_ element: AXUIElement, indent: Int = 0) {
    let padding = String(repeating: "  ", count: indent)

    // Roles / Titles / Values
    let role = getAXValue(element, kAXRoleAttribute as CFString) as? String ?? "Unknown"
    let title = getAXValue(element, kAXTitleAttribute as CFString) as? String
    let value = getAXValue(element, kAXValueAttribute as CFString)

    // Frame
    var frameDesc = ""
    if
        let posRef = getAXValue(element, kAXPositionAttribute as CFString),
        let sizeRef = getAXValue(element, kAXSizeAttribute as CFString),
        let posValue = axValue(posRef, expectedType: .cgPoint),
        let sizeValue = axValue(sizeRef, expectedType: .cgSize)
    {
        var pos = CGPoint.zero
        var sz = CGSize.zero
        AXValueGetValue(posValue, .cgPoint, &pos)
        AXValueGetValue(sizeValue, .cgSize, &sz)
        frameDesc = " frame=\(pos) \(sz)"
    }

    print("\(padding)- Role: \(role)"
        + (title != nil ? ", Title: \(title!)" : "")
        + (value != nil ? ", Value: \(value!)" : "")
        + frameDesc
    )

    // Children
    if let children = getAXValue(element, kAXChildrenAttribute as CFString) as? [AXUIElement] {
        for child in children {
            printElement(child, indent: indent + 1)
        }
    }
}

// MARK: - Main

let runningApps = NSWorkspace.shared.runningApplications.filter {
    $0.activationPolicy == .regular
}

for app in runningApps {
    let pid = app.processIdentifier
    let appElement = AXUIElementCreateApplication(pid)

    print("\n==============================")
    print("App: \(app.localizedName ?? "Unknown") (PID \(pid))")
    print("==============================")

    printElement(appElement)
}
