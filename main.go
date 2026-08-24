// GitPulse is an open-source CLI that automates scheduled, user-configured
// Git commits.
//
// The entry point lives here; the CLI surface is defined in the cmd package.
package main

import (
	"os"

	"github.com/dinalegw/GitPulse/cmd"
)

func main() {
	os.Exit(cmd.Execute())
}
