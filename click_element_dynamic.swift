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
    guard AXValueGetType(axValue) == expectedType else { return nil }
    return axValue
}

/// Get element frame (position and size)
func getElementFrame(_ element: AXUIElement) -> (position: CGPoint, size: CGSize)? {
    guard let posRef = getAXValue(element, kAXPositionAttribute as CFString),
          let sizeRef = getAXValue(element, kAXSizeAttribute as CFString),
          let posValue = axValue(posRef, expectedType: .cgPoint),
          let sizeValue = axValue(sizeRef, expectedType: .cgSize) else {
        return nil
    }
    
    var pos = CGPoint.zero
    var size = CGSize.zero
    AXValueGetValue(posValue, .cgPoint, &pos)
    AXValueGetValue(sizeValue, .cgSize, &size)
    
    return (pos, size)
}

/// Recursively search for an element by title, role, or value
func findElement(_ element: AXUIElement, searchTerm: String, searchBy: SearchType = .title) -> AXUIElement? {
    let role = getAXValue(element, kAXRoleAttribute as CFString) as? String ?? ""
    let title = getAXValue(element, kAXTitleAttribute as CFString) as? String
    let value = getAXValue(element, kAXValueAttribute as CFString) as? String
    
    // Match based on search type
    let matches: Bool
    switch searchBy {
    case .title:
        matches = title?.lowercased().contains(searchTerm.lowercased()) ?? false
    case .role:
        matches = role.lowercased() == searchTerm.lowercased()
    case .value:
        matches = value?.lowercased().contains(searchTerm.lowercased()) ?? false
    case .any:
        matches = (title?.lowercased().contains(searchTerm.lowercased()) ?? false) ||
                  (value?.lowercased().contains(searchTerm.lowercased()) ?? false) ||
                  (role.lowercased().contains(searchTerm.lowercased()))
    }
    
    if matches {
        // Print element details for debugging
        if let frame = getElementFrame(element) {
            print("  Found: Role=\(role), Title=\(title ?? "nil"), Value=\(value ?? "nil")")
            print("  Frame: position=\(frame.position), size=\(frame.size)")
        }
        return element
    }
    
    // Search children recursively
    if let children = getAXValue(element, kAXChildrenAttribute as CFString) as? [AXUIElement] {
        for child in children {
            if let found = findElement(child, searchTerm: searchTerm, searchBy: searchBy) {
                return found
            }
        }
    }
    
    return nil
}

enum SearchType {
    case title
    case role
    case value
    case any
}

/// Click an AX element using the exact coordinates from dump_ui.swift
func clickElement(_ element: AXUIElement) -> Bool {
    guard let frame = getElementFrame(element) else {
        print("✗ Could not get element frame")
        return false
    }
    
    // Calculate center point using exact coordinates from dump_ui.swift
    let clickPoint = CGPoint(
        x: frame.position.x + frame.size.width / 2,
        y: frame.position.y + frame.size.height / 2
    )
    
    print("  Clicking at: x=\(clickPoint.x), y=\(clickPoint.y)")
    
    // Try AXPress action first
    let pressResult = AXUIElementPerformAction(element, kAXPressAction as CFString)
    if pressResult == .success {
        print("  ✓ Clicked using AXPress action")
        return true
    }
    
    // Fallback to CGEvent mouse click
    print("  AXPress failed, using mouse click...")
    
    // Move mouse to position
    CGWarpMouseCursorPosition(clickPoint)
    usleep(100000) // 100ms delay
    
    // Create and post mouse down event
    if let mouseDown = CGEvent(
        mouseEventSource: nil,
        mouseType: .leftMouseDown,
        mouseCursorPosition: clickPoint,
        mouseButton: .left
    ) {
        mouseDown.post(tap: .cghidEventTap)
    }
    
    usleep(50000) // 50ms delay
    
    // Create and post mouse up event
    if let mouseUp = CGEvent(
        mouseEventSource: nil,
        mouseType: .leftMouseUp,
        mouseCursorPosition: clickPoint,
        mouseButton: .left
    ) {
        mouseUp.post(tap: .cghidEventTap)
    }
    
    print("  ✓ Clicked using mouse events")
    return true
}

// MARK: - Main

func main() {
    let args = CommandLine.arguments
    
    guard args.count >= 2 else {
        print("Usage: ./click_element_dynamic <search_term> [app_name] [--role|--value|--any]")
        print("")
        print("Examples:")
        print("  ./click_element_dynamic 'New Tab' Safari")
        print("  ./click_element_dynamic 'AXButton' --role")
        print("  ./click_element_dynamic 'Submit' Chrome --any")
        print("")
        print("Search types:")
        print("  (default) - Search by title")
        print("  --role    - Search by role (e.g., AXButton, AXTextField)")
        print("  --value   - Search by value attribute")
        print("  --any     - Search in title, value, or role")
        exit(1)
    }
    
    let searchTerm = args[1]
    var targetAppName: String?
    var searchType: SearchType = .title
    
    // Parse additional arguments
    for i in 2..<args.count {
        let arg = args[i]
        switch arg {
        case "--role":
            searchType = .role
        case "--value":
            searchType = .value
        case "--any":
            searchType = .any
        default:
            targetAppName = arg
        }
    }
    
    print("Searching for: '\(searchTerm)' (type: \(searchType))")
    if let appName = targetAppName {
        print("Target app: \(appName)")
    }
    
    // Get running applications
    var runningApps = NSWorkspace.shared.runningApplications.filter {
        $0.activationPolicy == .regular
    }
    
    // Filter by app name if provided
    if let appName = targetAppName {
        runningApps = runningApps.filter {
            $0.localizedName?.lowercased().contains(appName.lowercased()) ?? false
        }
    }
    
    // Search for element in each app
    for app in runningApps {
        let pid = app.processIdentifier
        let appElement = AXUIElementCreateApplication(pid)
        
        print("\n→ Searching in: \(app.localizedName ?? "Unknown") (PID \(pid))")
        
        // Activate the application first
        app.activate(options: [.activateIgnoringOtherApps])
        usleep(300000) // 300ms to let app come to foreground
        
        if let foundElement = findElement(appElement, searchTerm: searchTerm, searchBy: searchType) {
            print("✓ Found element matching '\(searchTerm)'")
            
            if clickElement(foundElement) {
                print("✓ Successfully clicked element")
                exit(0)
            } else {
                print("✗ Failed to click element")
                exit(1)
            }
        }
    }
    
    print("\n✗ Element not found matching '\(searchTerm)'")
    exit(1)
}

main()