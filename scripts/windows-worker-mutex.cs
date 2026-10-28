using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;

// Kernel ownership is authoritative: process termination releases the mutex even
// when JavaScript exit handlers never run. No saved PID is used to identify owners.
public sealed class LostFoundWorkerMutex : IDisposable {
    IntPtr handle;
    bool owned;
    public bool WasAbandoned { get; private set; }
    [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes { public int length; public IntPtr descriptor; public int inherit; }
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string text, uint revision, out IntPtr descriptor, out uint size);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateMutexEx(ref SecurityAttributes attributes, string name, uint flags, uint access);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReleaseMutex(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr handle);

    public static LostFoundWorkerMutex Open(string project, string profile) {
        if(!Regex.IsMatch(profile ?? "", @"\Awindows-worker(-[a-zA-Z0-9_-]+)?\z")) throw new ArgumentException("Invalid worker profile.");
        string sid=WindowsIdentity.GetCurrent().User.Value;
        string canonical=Path.GetFullPath(project).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar).ToUpperInvariant();
        string fingerprint;
        using(var sha=SHA256.Create()) fingerprint=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(sid+"\n"+canonical+"\n"+profile.ToUpperInvariant()))).Replace("-", "");
        IntPtr descriptor; uint size;
        // Restrict the kernel object's ACL to this Windows user. Global namespace
        // also prevents duplicates across multiple login sessions for this user.
        if(!ConvertStringSecurityDescriptorToSecurityDescriptor("D:P(A;;GA;;;"+sid+")",1,out descriptor,out size)) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            var attributes=new SecurityAttributes {length=Marshal.SizeOf(typeof(SecurityAttributes)),descriptor=descriptor,inherit=0};
            IntPtr handle=CreateMutexEx(ref attributes,"Global\\LostFound-AI-"+fingerprint,0,0x001F0001);
            if(handle==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            return new LostFoundWorkerMutex {handle=handle};
        } finally {LocalFree(descriptor);}
    }
    public bool Acquire(uint milliseconds) {
        if(handle==IntPtr.Zero) throw new ObjectDisposedException("LostFoundWorkerMutex");
        if(owned) throw new InvalidOperationException("Worker mutex is already owned by this thread.");
        uint result=WaitForSingleObject(handle,milliseconds);
        if(result==0 || result==0x80) {owned=true;WasAbandoned=result==0x80;return true;}
        if(result==0x102) return false;
        throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    public void Dispose() {
        if(handle==IntPtr.Zero)return;
        if(owned && !ReleaseMutex(handle)) throw new Win32Exception(Marshal.GetLastWin32Error());
        owned=false;CloseHandle(handle);handle=IntPtr.Zero;
    }
}
