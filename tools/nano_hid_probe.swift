import Foundation
import IOKit.hid

let vendorID = 5418
let productID = 35047

final class ProbeContext {
    private let file: FileHandle
    private(set) var reportCount = 0
    private(set) var valueCount = 0
    private(set) var pollChangeCount = 0
    private var pollCache: [String: [UInt8]] = [:]
    private var pollResultsLogged = Set<String>()

    init(file: FileHandle) {
        self.file = file
    }

    func log(_ line: String) {
        print(line)
        if let data = (line + "\n").data(using: .utf8) {
            file.write(data)
        }
    }

    func record(reportID: UInt32, bytes: [UInt8], result: IOReturn, reportType: IOHIDReportType) {
        reportCount += 1
        log("\(unixMS()) reportID=\(reportID) type=\(reportType.rawValue) result=\(result) len=\(bytes.count) bytes=\(hex(bytes))")
    }

    func record(value: IOHIDValue, result: IOReturn) {
        valueCount += 1
        let element = IOHIDValueGetElement(value)
        let usagePage = IOHIDElementGetUsagePage(element)
        let usage = IOHIDElementGetUsage(element)
        let reportID = IOHIDElementGetReportID(element)
        let intValue = IOHIDValueGetIntegerValue(value)
        let length = IOHIDValueGetLength(value)
        let bytePtr = IOHIDValueGetBytePtr(value)
        let bytes = Array(UnsafeBufferPointer(start: bytePtr, count: length))
        log("\(unixMS()) value reportID=\(reportID) usagePage=\(usagePage) usage=\(usage) result=\(result) int=\(intValue) len=\(bytes.count) bytes=\(hex(bytes))")
    }

    func poll(device: IOHIDDevice, label: String, reportID: CFIndex, maxLength: Int) {
        var length = maxLength
        var buffer = [UInt8](repeating: 0, count: maxLength)
        let result = buffer.withUnsafeMutableBufferPointer { pointer -> IOReturn in
            guard let baseAddress = pointer.baseAddress else {
                return kIOReturnNoMemory
            }
            return IOHIDDeviceGetReport(
                device,
                kIOHIDReportTypeInput,
                reportID,
                baseAddress,
                &length
            )
        }
        let key = "\(label)#\(reportID)"

        if result == kIOReturnSuccess {
            let bytes = Array(buffer.prefix(length))
            if pollCache[key] != bytes {
                pollCache[key] = bytes
                pollChangeCount += 1
                log("\(unixMS()) poll label=\"\(label)\" reportID=\(reportID) result=\(result) len=\(bytes.count) bytes=\(hex(bytes))")
            }
        } else if !pollResultsLogged.contains(key) {
            pollResultsLogged.insert(key)
            log("\(unixMS()) poll label=\"\(label)\" reportID=\(reportID) result=\(result)")
        }
    }
}

func printUsage() {
    print("""
    Usage:
      swift tools/nano_hid_probe.swift [duration_seconds]

    Example:
      swift tools/nano_hid_probe.swift 60
    """)
}

func unixMS() -> UInt64 {
    UInt64(Date().timeIntervalSince1970 * 1000)
}

func hex(_ bytes: [UInt8]) -> String {
    bytes.map { String(format: "%02X", $0) }.joined(separator: " ")
}

func repoLogURL() -> URL {
    URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        .appendingPathComponent("logs")
        .appendingPathComponent("hid-probe.log")
}

func openLogFile() throws -> FileHandle {
    let url = repoLogURL()
    try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    if !FileManager.default.fileExists(atPath: url.path) {
        FileManager.default.createFile(atPath: url.path, contents: nil)
    }
    let handle = try FileHandle(forWritingTo: url)
    try handle.seekToEnd()
    return handle
}

func property(_ device: IOHIDDevice, _ key: String) -> String {
    guard let value = IOHIDDeviceGetProperty(device, key as CFString) else {
        return "-"
    }
    return "\(value)"
}

func label(for device: IOHIDDevice) -> String {
    let product = property(device, kIOHIDProductKey)
    let serial = property(device, kIOHIDSerialNumberKey)
    return "\(product) \(serial)"
}

let args = CommandLine.arguments.dropFirst()
if args.contains("--help") || args.contains("-h") {
    printUsage()
    exit(0)
}

let durationSeconds = args.first.flatMap { Int($0) } ?? 60
let logFile = try openLogFile()
let context = ProbeContext(file: logFile)
let retainedContext = Unmanaged.passRetained(context)
defer {
    retainedContext.release()
    try? logFile.close()
}

context.log("=== HID PROBE START \(unixMS()) duration=\(durationSeconds)s log=\(repoLogURL().path) vendor=\(vendorID) product=\(productID) ===")

let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
let matching: [String: Any] = [
    kIOHIDVendorIDKey as String: vendorID,
    kIOHIDProductIDKey as String: productID
]
IOHIDManagerSetDeviceMatching(manager, matching as CFDictionary)

let callback: IOHIDReportCallback = { rawContext, result, _sender, reportType, reportID, report, reportLength in
    guard let rawContext else {
        return
    }

    let context = Unmanaged<ProbeContext>.fromOpaque(rawContext).takeUnretainedValue()
    let bytes = Array(UnsafeBufferPointer(start: report, count: reportLength))
    context.record(reportID: reportID, bytes: bytes, result: result, reportType: reportType)
}

let valueCallback: IOHIDValueCallback = { rawContext, result, _sender, value in
    guard let rawContext else {
        return
    }

    let context = Unmanaged<ProbeContext>.fromOpaque(rawContext).takeUnretainedValue()
    context.record(value: value, result: result)
}

IOHIDManagerRegisterInputReportCallback(
    manager,
    callback,
    retainedContext.toOpaque()
)
IOHIDManagerRegisterInputValueCallback(
    manager,
    valueCallback,
    retainedContext.toOpaque()
)
IOHIDManagerScheduleWithRunLoop(
    manager,
    CFRunLoopGetCurrent(),
    CFRunLoopMode.defaultMode.rawValue
)

let openResult = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
context.log("IOHIDManagerOpen result=\(openResult)")

let devices = (IOHIDManagerCopyDevices(manager) as? Set<IOHIDDevice>) ?? []
if !devices.isEmpty {
    context.log("Matched HID devices:")
    for device in devices {
        context.log("  product=\(property(device, kIOHIDProductKey)) serial=\(property(device, kIOHIDSerialNumberKey)) transport=\(property(device, kIOHIDTransportKey)) usagePage=\(property(device, kIOHIDPrimaryUsagePageKey)) usage=\(property(device, kIOHIDPrimaryUsageKey)) maxInput=\(property(device, kIOHIDMaxInputReportSizeKey)) maxOutput=\(property(device, kIOHIDMaxOutputReportSizeKey))")
    }
} else {
    context.log("No matching HID devices found.")
}

context.log("Touch Nano hardware now: twist knobs, press/hold footswitches, bank, FX, save, exit, capture.")

let end = Date().addingTimeInterval(TimeInterval(durationSeconds))
while Date() < end {
    for device in devices {
        let deviceLabel = label(for: device)
        context.poll(device: device, label: deviceLabel, reportID: 1, maxLength: 65)
        context.poll(device: device, label: deviceLabel, reportID: 2, maxLength: 65)
    }
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.25))
}

IOHIDManagerUnscheduleFromRunLoop(
    manager,
    CFRunLoopGetCurrent(),
    CFRunLoopMode.defaultMode.rawValue
)
IOHIDManagerClose(manager, IOOptionBits(kIOHIDOptionsTypeNone))

context.log("=== HID PROBE STOP \(unixMS()) reports=\(context.reportCount) values=\(context.valueCount) pollChanges=\(context.pollChangeCount) ===")
if context.reportCount == 0 && context.valueCount == 0 && context.pollChangeCount == 0 {
    context.log("RESULT no inbound USB HID reports, values, or changed polled reports were observed from the Nano Cortex HID interface.")
}
