package main

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

const pokeAPIBase = "https://pokeapi.co/api/v2"

var httpClient = &http.Client{Timeout: 10 * time.Second}

func proxyTo(c echo.Context, url string) error {
	resp, err := httpClient.Get(url)
	if err != nil {
		return c.JSON(http.StatusBadGateway, map[string]string{"error": err.Error()})
	}
	defer resp.Body.Close()
	c.Response().Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	c.Response().WriteHeader(resp.StatusCode)
	_, err = io.Copy(c.Response(), resp.Body)
	return err
}

func main() {
	e := echo.New()
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:3000", "http://localhost:3001", "http://localhost:3002"},
		AllowMethods: []string{http.MethodGet},
	}))

	api := e.Group("/api")
	api.GET("/pokemon", func(c echo.Context) error {
		return proxyTo(c, fmt.Sprintf("%s/pokemon?limit=%s&offset=%s",
			pokeAPIBase, c.QueryParam("limit"), c.QueryParam("offset")))
	})
	api.GET("/pokemon/:id", func(c echo.Context) error {
		return proxyTo(c, fmt.Sprintf("%s/pokemon/%s", pokeAPIBase, c.Param("id")))
	})
	api.GET("/pokemon-species/:id", func(c echo.Context) error {
		return proxyTo(c, fmt.Sprintf("%s/pokemon-species/%s", pokeAPIBase, c.Param("id")))
	})
	api.GET("/ability/:name", func(c echo.Context) error {
		return proxyTo(c, fmt.Sprintf("%s/ability/%s", pokeAPIBase, c.Param("name")))
	})
	api.GET("/move/:name", func(c echo.Context) error {
		return proxyTo(c, fmt.Sprintf("%s/move/%s", pokeAPIBase, c.Param("name")))
	})

	e.Logger.Fatal(e.Start(":8080"))
}
