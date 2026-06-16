If you run into problems, you now can easily test if a specific function is supported on your platform and returns plausible results. In this section you will learn how you can easily test all functions on your platform:

## Testing on your platform

First of all make sure, that you have git installed on your machine.

Next you need to clone the git repository to a directory of your choice:

```
git clone https:<span>//github.com/sebhildebrandt/systeminformation.git</span>
```

Go inside the newly created systeminformation directory

```
cd systeminformation
```

If you already cloned the repository, make sure that you have the latest version installed:

```
git pull
```

Now you can start the test with

```
npm run test
```

You get a nice menu where you now can run function by function and see if you get meaningfull results (if supported on yur platform) or errors. Sample output:

```
SYSTEMINFORMATION - Test Scripts - Version: <span>5.</span>x.y
═══════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  a ... Audio              i ... INET Latency       t ... time               <span>1</span> ... NET Iface Default     ? ... Get <span>Object</span>    │
│  b ... BIOS               I ... INET Check Site    T ... CPU Temperature    <span>2</span> ... NET Gateway Default   , ... All Static    │
│  B ... Baseboard          j ... CPU Current Speed  u ... USB                <span>3</span> ... NET Interfaces        . ... All Dynamic   │
│  C ... Chassis            l ... CPU Current Load   U ... UUID               <span>4</span> ... NET Stats             / ... All           │
│  c ... CPU                L ... Full Load          v ... Versions           <span>5</span> ... NET Connections                           │
│  d ... DiskLayout         m ... Memory             V ... Virtual Box                                                        │
│  D ... DiskIO             M ... MEM Layout         w ... WIFI networks                                                      │
│  e ... Block Devices      o ... OS Info            W ... WIFI interfaces                                                    │
│  E ... Open Files         p ... Processes          x ... WIFI connections   <span>6</span> ... Docker Info                               │
│  f ... FS Size            P ... Process Load       y ... System             <span>7</span> ... Docker Images                             │
│  F ... FS Stats           r ... Printer            Y ... Battery            <span>8</span> ... Docker Container                          │
│  g ... Graphics           s ... Services           z ... Users              <span>9</span> ... Docker Cont Stats                         │
│  h ... Bluetooth          S ... Shell                                       <span>0</span> ... Docker Cont Proc      q &gt;&gt;&gt; QUIT          │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Press q to exit the test suite

Here a sample output for the e.g. c ... CPU

```
┌────────────────────────────────────────────────┐
│  CPU                                  v: <span>5.</span>x.y │
└────────────────────────────────────────────────┘
{
  <span>manufacturer</span>: <span>'Intel®'</span>,
  <span>brand</span>: <span>'Core™ i7-8569U'</span>,
  <span>vendor</span>: <span>'GenuineIntel'</span>,
  <span>family</span>: <span>'6'</span>,
  <span>model</span>: <span>'142'</span>,
  <span>stepping</span>: <span>'10'</span>,
  <span>revision</span>: <span>''</span>,
  <span>voltage</span>: <span>''</span>,
  <span>speed</span>: <span>2.8</span>,
  <span>speedMin</span>: <span>2.8</span>,
  <span>speedMax</span>: <span>2.8</span>,
  <span>governor</span>: <span>''</span>,
  <span>cores</span>: <span>8</span>,
  <span>physicalCores</span>: <span>4</span>,
  <span>processors</span>: <span>1</span>,
  <span>socket</span>: <span>''</span>,
  <span>flags</span>: <span>'fpu vme de pse tsc ...'</span>,
  <span>virtualization</span>: <span>true</span>,
  <span>cache</span>: { <span>l1d</span>: <span>32768</span>, <span>l1i</span>: <span>32768</span>, <span>l2</span>: <span>262144</span>, <span>l3</span>: <span>8388608</span> }
}
```

Make sure to have a look in the documentation if there are already [known issues](https://systeminformation.io/issues.html) and if the specific function is supported on your platform. If yes, check whether results are meaningfull and plausible.

I highly appreciate if you test all functions on your specific platform. This will help me improving the package and provide the best possible platform support.
