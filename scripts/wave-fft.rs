#![no_std]
#![no_main]

use core::panic::PanicInfo;
#[panic_handler]
fn panic(_: &PanicInfo) -> ! { loop {} }

const MAX_SIZE: usize = 128;
#[no_mangle] static mut REAL: [f64; MAX_SIZE*MAX_SIZE] = [0.0; MAX_SIZE*MAX_SIZE];
#[no_mangle] static mut IMAGINARY: [f64; MAX_SIZE*MAX_SIZE] = [0.0; MAX_SIZE*MAX_SIZE];
#[no_mangle] static mut WR: [f64; MAX_SIZE-1] = [0.0; MAX_SIZE-1];
#[no_mangle] static mut WI: [f64; MAX_SIZE-1] = [0.0; MAX_SIZE-1];
#[no_mangle] static mut SWAPS: [u32; MAX_SIZE] = [0; MAX_SIZE];

#[no_mangle]
pub fn buffer_ptr(slot: u32) -> *mut u8 {
    match slot {
        0 => (&raw mut REAL).cast(),
        1 => (&raw mut IMAGINARY).cast(),
        2 => (&raw mut WR).cast(),
        3 => (&raw mut WI).cast(),
        4 => (&raw mut SWAPS).cast(),
        _ => core::ptr::null_mut(),
    }
}

unsafe fn transform(n: usize, offset: usize, stride: usize, swap_count: usize) {
    let real=(&raw mut REAL).cast::<f64>();
    let imaginary=(&raw mut IMAGINARY).cast::<f64>();
    let swaps=(&raw mut SWAPS).cast::<u32>();
    let wr=(&raw mut WR).cast::<f64>();
    let wi=(&raw mut WI).cast::<f64>();
    let mut i=0;
    while i<swap_count {
        let a=offset+swaps.add(i).read() as usize*stride;
        let b=offset+swaps.add(i+1).read() as usize*stride;
        let ar=real.add(a).read(); let ai=imaginary.add(a).read();
        real.add(a).write(real.add(b).read());
        imaginary.add(a).write(imaginary.add(b).read());
        real.add(b).write(ar); imaginary.add(b).write(ai);
        i+=2;
    }
    let mut length=2;
    while length<=n {
        let half=length/2; let delta=half*stride;
        let twiddle_offset=half-1;
        let mut start=0;
        while start<n {
            let mut j=0; let mut a=offset+start*stride;
            while j<half {
                let b=a+delta;
                let rb=real.add(b).read(); let ib=imaginary.add(b).read();
                let wrj=wr.add(twiddle_offset+j).read(); let wij=wi.add(twiddle_offset+j).read();
                let br=rb*wrj-ib*wij; let bi=rb*wij+ib*wrj;
                real.add(b).write(real.add(a).read()-br);
                imaginary.add(b).write(imaginary.add(a).read()-bi);
                real.add(a).write(real.add(a).read()+br);
                imaginary.add(a).write(imaginary.add(a).read()+bi);
                j+=1; a+=stride;
            }
            start+=length;
        }
        length*=2;
    }
}

#[no_mangle]
pub unsafe extern "C" fn inverse_fft(size: u32, swap_count: u32) -> u32 {
    let n=size as usize;
    if n<2 || n>MAX_SIZE || n&(n-1)!=0 || swap_count>MAX_SIZE as u32 || swap_count&1!=0 { return 0; }
    for y in 0..n { transform(n,y*n,1,swap_count as usize); }
    for x in 0..n { transform(n,x,n,swap_count as usize); }
    let real=(&raw mut REAL).cast::<f64>();
    let imaginary=(&raw mut IMAGINARY).cast::<f64>();
    let normalization=1.0/(n*n) as f64;
    for i in 0..n*n {
        real.add(i).write(real.add(i).read()*normalization);
        imaginary.add(i).write(imaginary.add(i).read()*normalization);
    }
    1
}
