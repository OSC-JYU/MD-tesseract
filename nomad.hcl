job "md-tesseract" {
  type = "service"

  group "MD-tesseract" {
    count = 1

    restart {
      attempts = 2
      interval = "5m"
      delay    = "15s"
      mode     = "fail"
    }

    reschedule {
      attempts       = 2
      interval       = "10m"
      delay          = "30s"
      delay_function = "constant"
      unlimited      = false
    }

    network {
      port "node" {
        to = 8400
      }
    }

    service {
      name     = "md-tesseract"
      port     = "node"
      provider = "nomad"
      
      check {
        type     = "http"
        path     = "/health"
        interval = "10s"
        timeout  = "3s"
      }
    }

    task "md-tesseract" {
      driver = "podman"
      config {
          image = "localhost/messydesk/md-tesseract:0.2"
          force_pull = false
          ports = ["node"]
      }
      env {
        PORT = "8400"
      }
      resources {
        memory = 1000  # Memory in MB
        cpu    = 500  # CPU shares (500 = 50% of 1 CPU)
      }
    }
  }
}